import {
  detenerProyecto,
  iniciarProyecto,
  listarServicios,
  type ServicioProyecto,
} from "@/lib/docker/proyectos";
import { logger } from "@/lib/logger";
import { notificarFalloBackup } from "@/lib/notificaciones";
import { prisma } from "@/lib/prisma";
import { eliminarAuxiliar, nombreAuxiliar } from "./auxiliar";
import {
  filtrarRolesSql,
  hashClave,
  procesoEsperarBd,
  procesoExtraerDatos,
  procesoRestaurarMysql,
  procesoRestaurarPg,
  procesoRestaurarRolesPg,
} from "./comandos";
import { cargarConfigResuelta, conRestic } from "./configuracion";
import { copiarProyecto, LIMITE_BD_MS, LIMITE_DATOS_MS } from "./copiaProyecto";
import {
  detectarProyecto,
  type Deteccion,
  type Elemento,
  type ElementoBd,
} from "./deteccion";
import { motivoDeFallo, soltarOperacion, tomarOperacion } from "./operacion";
import { ejecutar, encadenar } from "./procesos";
import { desmarcarRestaurando, marcarRestaurando } from "./restaurando";
import type { ConfigResuelta } from "./repositorio";
import {
  LIMITE_CONSULTA_MS,
  listarSnapshotsProyectos,
  volcarSnapshot,
  type Restic,
  type SnapshotProyecto,
} from "./restic";
import { comprobarRuta, type EstadoRuta } from "./rutaSegura";

const log = logger.child({ module: "backups" });

export class RestauracionRechazada extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestauracionRechazada";
  }
}

export class DeployEnCurso extends Error {
  constructor() {
    super("Hay un deploy en curso");
    this.name = "DeployEnCurso";
  }
}

const ESPERA_BD_MS = 2 * 60 * 1000;
const INTERVALO_BD_MS = 2_000;
const ELEMENTO_SIN_CERRAR = "No se pudo registrar el resultado del elemento";
const SUPERUSUARIO_PG = 'printf %s "${POSTGRES_USER:-postgres}"';
const MOTIVO_RUTA: Record<Exclude<EstadoRuta, "ok">, string> = {
  enlace: "contiene un enlace simbólico",
  no_existe: "la carpeta no existe",
  no_carpeta: "no es una carpeta",
};

type ProyectoRestauracion = { id: string; nombre: string; clienteSlug: string };
type Seleccion = { elemento: Elemento; partes: SnapshotProyecto[] };
type Plan = {
  proyecto: ProyectoRestauracion;
  config: ConfigResuelta;
  deteccion: Deteccion;
  claves: string[];
  seleccion: Seleccion[];
};
type Filas = { restauracion: string; previa: string };

const nombreDe = (p: ProyectoRestauracion) => `${p.clienteSlug}/${p.nombre}`;

const aviso = (p: ProyectoRestauracion) =>
  `Los Servicios de ${nombreDe(p)} se han quedado parados. Restaura otra vez (la copia previa está en la lista) o arráncalos a mano.`;

async function validar(p: {
  proyectoId: string;
  copiaId: string;
  claves: string[];
}): Promise<Plan> {
  const encontrado = await prisma.proyecto.findUnique({
    where: { id: p.proyectoId },
    select: {
      id: true,
      nombre: true,
      estado: true,
      cliente: { select: { slug: true } },
    },
  });
  if (!encontrado) throw new RestauracionRechazada("El Proyecto no existe");
  if (encontrado.estado === "deploying") throw new DeployEnCurso();
  const proyecto = {
    id: encontrado.id,
    nombre: encontrado.nombre,
    clienteSlug: encontrado.cliente.slug,
  };
  const claves = [...new Set(p.claves)];
  if (claves.length === 0) {
    throw new RestauracionRechazada("Elige al menos un elemento que restaurar");
  }
  const config = await cargarConfigResuelta();
  const snapshots = await conRestic(
    config,
    AbortSignal.timeout(LIMITE_CONSULTA_MS),
    (r) => listarSnapshotsProyectos(r, proyecto.id),
  );
  const deteccion = await detectarProyecto(
    proyecto.clienteSlug,
    proyecto.nombre,
  );
  const seleccion: Seleccion[] = [];
  for (const clave of claves) {
    const partes = snapshots.filter(
      (s) => s.backupId === p.copiaId && s.hashElemento === hashClave(clave),
    );
    if (partes.length === 0) {
      throw new RestauracionRechazada(`${clave} no está en esa copia`);
    }
    // Restoring a folder the compose no longer mounts would write blind.
    const elemento = deteccion.elementos.find((e) => e.clave === clave);
    if (!elemento) {
      throw new RestauracionRechazada(`${clave} ya no se monta en el Proyecto`);
    }
    if (elemento.tipo === "datos") {
      if (!elemento.restaurable) {
        throw new RestauracionRechazada(
          "Se restaura a mano: ver docs/recuperacion.md",
        );
      }
      // The folder may have been swapped for a link since the detection ran.
      if (elemento.montaje === "bind") {
        const estado = await comprobarRuta(elemento.origen);
        if (estado !== "ok") {
          throw new RestauracionRechazada(`${clave}: ${MOTIVO_RUTA[estado]}`);
        }
      }
    }
    seleccion.push({ elemento, partes });
  }
  return { proyecto, config, deteccion, claves, seleccion };
}

function pausa(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const alAbortar = () => {
      clearTimeout(temporizador);
      reject(signal.reason);
    };
    // Up to 60 retries on the lock's signal: never leave listeners behind.
    const temporizador = setTimeout(() => {
      signal.removeEventListener("abort", alAbortar);
      resolve();
    }, ms);
    signal.addEventListener("abort", alAbortar, { once: true });
  });
}

async function esperarBd(bd: ElementoBd, signal: AbortSignal): Promise<void> {
  const fin = Date.now() + ESPERA_BD_MS;
  const p = procesoEsperarBd(bd.contenedorId, bd.motor);
  for (;;) {
    try {
      await ejecutar(p.comando, p.args, { env: p.env, signal });
      return;
    } catch (err) {
      if (signal.aborted) throw err;
      if (Date.now() + INTERVALO_BD_MS > fin) {
        throw new Error(`${bd.servicio} no acepta conexiones tras 2 minutos`);
      }
      await pausa(INTERVALO_BD_MS, signal);
    }
  }
}

async function copiaPrevia(
  plan: Plan,
  previaId: string,
  arrancadas: Set<string>,
  signal: AbortSignal,
): Promise<void> {
  // copiarProyecto refuses stopped databases: those started in step 1 run now.
  const deteccion: Deteccion = {
    ...plan.deteccion,
    elementos: plan.deteccion.elementos.map((e) =>
      e.tipo === "bd" && arrancadas.has(e.servicio)
        ? { ...e, enMarcha: true }
        : e,
    ),
  };
  const resultado = await conRestic(plan.config, signal, (r) =>
    copiarProyecto({
      proyecto: plan.proyecto,
      backupId: previaId,
      origen: "antes_de_restaurar",
      restic: r,
      deteccion,
      incluidos: (clave) => plan.claves.includes(clave),
      soloClaves: plan.claves,
    }),
  ).catch((err: unknown) => motivoDeFallo(err, signal));
  const { count } = await prisma.elementoCopia.updateMany({
    where: { backupId: previaId, resultado: "en_curso" },
    data: { resultado: "error", error: ELEMENTO_SIN_CERRAR },
  });
  const fallidos =
    typeof resultado === "string"
      ? resultado
      : resultado
          .filter((r) => !r.ok)
          .map((r) => `${r.clave}: ${r.error}`)
          .join("\n");
  const error = fallidos || (count > 0 ? ELEMENTO_SIN_CERRAR : "");
  await prisma.backup.update({
    where: { id: previaId },
    data: error
      ? { resultado: "error", error, finalizadoEn: new Date() }
      : { resultado: "exito", finalizadoEn: new Date() },
  });
  // Without a good pre-copy nothing may be replaced.
  if (error) throw new Error(`No se restauró: falló la copia previa (${error})`);
}

async function restaurarPartes(
  s: Seleccion,
  r: Restic,
  restauracionId: string,
  signal: AbortSignal,
): Promise<void> {
  const e = s.elemento;
  if (e.tipo === "datos") {
    const [parte] = s.partes;
    await encadenar(
      volcarSnapshot(r, parte.id, parte.ruta),
      procesoExtraerDatos(nombreAuxiliar(restauracionId, e.clave), e.origen),
      { signal },
    );
    return;
  }
  const esRoles = (p: SnapshotProyecto) => p.ruta.endsWith("/_roles.sql");
  // Databases are owned by roles: those must exist before the bases.
  const partes = [...s.partes].sort(
    (a, b) =>
      Number(esRoles(b)) - Number(esRoles(a)) || a.ruta.localeCompare(b.ruta),
  );
  for (const parte of partes) {
    const volcado = volcarSnapshot(r, parte.id, parte.ruta);
    if (!esRoles(parte)) {
      const destino =
        e.motor === "mysql"
          ? procesoRestaurarMysql(e.contenedorId)
          : procesoRestaurarPg(e.contenedorId);
      await encadenar(volcado, destino, { signal });
      continue;
    }
    const sql = await ejecutar(volcado.comando, volcado.args, {
      env: volcado.env,
      signal,
    });
    const rol = await ejecutar(
      "docker",
      ["exec", e.contenedorId, "sh", "-c", SUPERUSUARIO_PG],
      { signal },
    );
    const psql = procesoRestaurarRolesPg(e.contenedorId);
    await ejecutar(psql.comando, psql.args, {
      env: psql.env,
      signal,
      entrada: filtrarRolesSql(sql, rol),
    });
  }
}

async function restaurarElemento(
  s: Seleccion,
  r: Restic,
  restauracionId: string,
  ciclo: AbortSignal,
): Promise<void> {
  const e = s.elemento;
  const [ms, texto] =
    e.tipo === "bd"
      ? [LIMITE_BD_MS, "60 minutos"]
      : [LIMITE_DATOS_MS, "12 horas"];
  const limite = new AbortController();
  const temporizador = setTimeout(
    () => limite.abort(`Cancelado: ${e.clave} superó ${texto}`),
    ms,
  );
  const signal = AbortSignal.any([ciclo, limite.signal]);
  try {
    await restaurarPartes(s, r, restauracionId, signal);
  } catch (err) {
    throw new Error(`${e.clave}: ${motivoDeFallo(err, signal)}`);
  } finally {
    clearTimeout(temporizador);
    // Killing the docker CLI leaves the container running.
    if (e.tipo === "datos") {
      const auxiliar = nombreAuxiliar(restauracionId, e.clave);
      await eliminarAuxiliar(auxiliar).catch((err: unknown) =>
        log.warn(
          { err, auxiliar },
          "No se pudo eliminar el contenedor auxiliar",
        ),
      );
    }
  }
}

// Docker reports an unhealthy container as "error" but it is still up.
const estabaEnMarcha = (s: ServicioProyecto) =>
  s.estado === "running" || s.detalle.startsWith("Up");

async function restaurar(
  plan: Plan,
  filas: Filas,
  signal: AbortSignal,
): Promise<void> {
  const { proyecto } = plan;
  const { clienteSlug: slug, nombre } = proyecto;
  const enMarcha = (await listarServicios(slug, nombre))
    .filter(estabaEnMarcha)
    .map((s) => s.servicio);
  const bds = plan.seleccion.flatMap((s) =>
    s.elemento.tipo === "bd" ? [s.elemento] : [],
  );
  const servicioBd = new Set(bds.map((b) => b.servicio));
  const arrancadas = new Set<string>();
  let tocado = false;
  try {
    for (const bd of bds.filter((b) => !b.enMarcha)) {
      arrancadas.add(bd.servicio);
      await iniciarProyecto(slug, nombre, bd.servicio);
    }
    for (const bd of bds) await esperarBd(bd, signal);
    await copiaPrevia(plan, filas.previa, arrancadas, signal);
    signal.throwIfAborted();
    tocado = true;
    for (const s of enMarcha.filter((x) => !servicioBd.has(x))) {
      await detenerProyecto(slug, nombre, s);
    }
    // Data first: an app restarted later must find files and rows together.
    const ordenadas = [
      ...plan.seleccion.filter((s) => s.elemento.tipo === "datos"),
      ...plan.seleccion.filter((s) => s.elemento.tipo === "bd"),
    ];
    await conRestic(plan.config, signal, async (r) => {
      for (const s of ordenadas) {
        signal.throwIfAborted();
        await restaurarElemento(s, r, filas.restauracion, signal);
      }
    });
    for (const s of enMarcha) await iniciarProyecto(slug, nombre, s);
    for (const s of arrancadas) await detenerProyecto(slug, nombre, s);
    await prisma.backup.update({
      where: { id: filas.restauracion },
      data: { resultado: "exito", finalizadoEn: new Date() },
    });
  } catch (err) {
    const motivo = motivoDeFallo(err, signal);
    const pararSinPerder = (s?: string) =>
      (s ? detenerProyecto(slug, nombre, s) : detenerProyecto(slug, nombre))
        .catch((e: unknown) =>
          log.warn(
            { err: e, proyectoId: proyecto.id },
            "No se pudieron parar los Servicios tras la restauración fallida",
          ),
        );
    let error = motivo;
    if (tocado) {
      // Half-restored data must not be served: everything stays stopped.
      await pararSinPerder();
      error = `${motivo}\n${aviso(proyecto)}`;
    } else {
      for (const s of arrancadas) await pararSinPerder(s);
    }
    try {
      await prisma.backup.update({
        where: { id: filas.restauracion },
        data: { resultado: "error", error, finalizadoEn: new Date() },
      });
    } finally {
      await notificarFalloBackup({
        operacion: "restauracion",
        origen: "manual",
        error,
        proyecto: nombreDe(proyecto),
      });
    }
  }
}

export async function iniciarRestauracionProyecto(p: {
  proyectoId: string;
  copiaId: string;
  claves: string[];
}): Promise<{ id: string }> {
  const plan = await validar(p);
  const { proyecto } = plan;
  const controller = tomarOperacion();
  try {
    marcarRestaurando(proyecto.id);
  } catch (err) {
    soltarOperacion();
    throw err;
  }
  const liberar = () => {
    desmarcarRestaurando(proyecto.id);
    soltarOperacion();
  };
  let filas: Filas;
  try {
    const datos = {
      proyectoId: proyecto.id,
      proyectoNombre: nombreDe(proyecto),
    };
    const restauracion = await prisma.backup.create({
      data: { operacion: "restauracion", origen: "manual", ...datos },
    });
    const previa = await prisma.backup.create({
      data: { operacion: "copia", origen: "antes_de_restaurar", ...datos },
    });
    filas = { restauracion: restauracion.id, previa: previa.id };
  } catch (err) {
    liberar();
    throw err;
  }
  void restaurar(plan, filas, controller.signal)
    .catch((err: unknown) =>
      log.error(
        { err, proyectoId: proyecto.id },
        "No se pudo registrar la restauración del Proyecto",
      ),
    )
    .finally(liberar);
  return { id: filas.restauracion };
}
