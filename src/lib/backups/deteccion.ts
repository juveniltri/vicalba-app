import path from "path";
import { env } from "@/env";
import {
  etiquetasVolumen,
  inspeccionarProyecto,
  type ContenedorInspeccionado,
  type Montaje,
} from "@/lib/docker/inspeccion";
import { logger } from "@/lib/logger";
import { comprobarRuta, type EstadoRuta } from "./rutaSegura";

const log = logger.child({ module: "backups" });

export type MotorBd = "postgres" | "mysql";

export type ElementoBd = {
  tipo: "bd";
  clave: string;
  servicio: string;
  motor: MotorBd;
  contenedorId: string;
  enMarcha: boolean;
};

export type ElementoDatos = {
  tipo: "datos";
  clave: string;
  origen: string;
  montaje: "bind" | "volume";
  restaurable: boolean;
};

export type Elemento = ElementoBd | ElementoDatos;
export type NoCopiado = { origen: string; motivo: string };
export type Deteccion = {
  valida: boolean;
  elementos: Elemento[];
  noCopiados: NoCopiado[];
};

type Contexto = {
  reposDir: string;
  clienteSlug: string;
  proyectoNombre: string;
  etiquetasVolumen: (n: string) => Promise<Record<string, string>>;
  comprobarRuta: (o: string) => Promise<EstadoRuta>;
};

const SIN_DETECTAR: Deteccion = {
  valida: false,
  elementos: [],
  noCopiados: [],
};
const VOLUMEN_ANONIMO = /^[0-9a-f]{64}$/;
const FUERA = "Fuera del Proyecto";
const MOTIVO_RUTA: Record<"enlace" | "no_existe", string> = {
  enlace: "Contiene un enlace simbólico",
  no_existe: "La carpeta no existe",
};

function limpia(ruta: string): string {
  const n = path.posix.normalize(ruta);
  return n.length > 1 ? n.replace(/\/+$/, "") : n;
}

// "" when `ruta` is `base` itself, null when it is outside.
function relativa(base: string, ruta: string): string | null {
  const rel = path.posix.relative(base, ruta);
  return rel === ".." || rel.startsWith("../") || path.posix.isAbsolute(rel)
    ? null
    : rel;
}

function nombreImagen(imagen: string): string {
  let ref = imagen.split("@")[0];
  const dosPuntos = ref.lastIndexOf(":");
  if (dosPuntos > ref.lastIndexOf("/")) ref = ref.slice(0, dosPuntos);
  const partes = ref.split("/");
  if (partes.length > 1 && /[.:]|^localhost$/.test(partes[0])) partes.shift();
  if (partes.length > 1 && partes[0] === "library") partes.shift();
  return partes.join("/");
}

function motorDe(imagen: string): MotorBd | null {
  const n = nombreImagen(imagen);
  if (n === "postgres" || n === "postgis/postgis" || n.startsWith("timescale/"))
    return "postgres";
  if (n === "mysql" || n === "mariadb") return "mysql";
  return null;
}

function directorioBd(c: ContenedorInspeccionado, motor: MotorBd): string {
  return motor === "postgres"
    ? limpia(c.env.PGDATA ?? "/var/lib/postgresql/data")
    : "/var/lib/mysql";
}

function identidad(m: Montaje): string {
  return m.tipo === "volume" && m.nombre ? m.nombre : limpia(m.origen);
}

type Clasificacion =
  | { tipo: "elemento"; elemento: ElementoDatos }
  | { tipo: "no_copiado"; motivo: string }
  | { tipo: "ignorar" };

async function clasificarBind(
  origen: string,
  ctx: Contexto,
): Promise<Clasificacion> {
  if (!path.posix.isAbsolute(origen))
    return { tipo: "no_copiado", motivo: FUERA };
  const cliente = path.posix.join(limpia(ctx.reposDir), ctx.clienteSlug);
  const enRepo = relativa(path.posix.join(cliente, ctx.proyectoNombre), origen);
  const enPanel = relativa(path.posix.join(cliente, ".panel"), origen);
  let clave: string;
  let restaurable: boolean;
  let rel: string;
  if (enRepo !== null) {
    if (enRepo === "")
      return { tipo: "no_copiado", motivo: "Es la raíz del repo" };
    [rel, clave, restaurable] = [enRepo, `datos:./${enRepo}`, true];
  } else if (enPanel !== null) {
    if (enPanel === "")
      return { tipo: "no_copiado", motivo: "Es la raíz de .panel" };
    // `.panel/` is shared by every Panel-edited compose of the Cliente:
    // restoring it would empty data other Proyectos are writing to.
    [rel, clave, restaurable] = [enPanel, `datos:.panel/${enPanel}`, false];
  } else {
    return { tipo: "no_copiado", motivo: FUERA };
  }
  if (rel.split("/").includes(".git"))
    return { tipo: "no_copiado", motivo: "Dentro de .git" };
  const estado = await ctx.comprobarRuta(origen);
  if (estado === "no_carpeta") return { tipo: "ignorar" };
  if (estado !== "ok")
    return { tipo: "no_copiado", motivo: MOTIVO_RUTA[estado] };
  return {
    tipo: "elemento",
    elemento: { tipo: "datos", clave, origen, montaje: "bind", restaurable },
  };
}

async function clasificarVolumen(
  nombre: string,
  ctx: Contexto,
): Promise<Clasificacion> {
  // Compose labels the volumes it creates; `external: true` ones (another
  // Cliente's, the Panel's own) lack the label and must never be restored.
  const etiquetas = await ctx.etiquetasVolumen(nombre);
  if (
    etiquetas["com.docker.compose.project"] !==
    `${ctx.clienteSlug}-${ctx.proyectoNombre}`
  )
    return { tipo: "no_copiado", motivo: "Volumen externo o de otro Proyecto" };
  return {
    tipo: "elemento",
    elemento: {
      tipo: "datos",
      clave: `volumen:${nombre}`,
      origen: nombre,
      montaje: "volume",
      restaurable: true,
    },
  };
}

function clasificar(m: Montaje, ctx: Contexto): Promise<Clasificacion> {
  if (m.tipo === "bind") return clasificarBind(limpia(m.origen), ctx);
  // Anonymous volumes (a Dockerfile VOLUME) change name on every recreate.
  if (m.tipo === "volume" && m.nombre && !VOLUMEN_ANONIMO.test(m.nombre))
    return clasificarVolumen(m.nombre, ctx);
  return Promise.resolve({ tipo: "ignorar" });
}

function detectarBds(contenedores: ContenedorInspeccionado[]): {
  bds: ElementoBd[];
  excluidos: Set<string>;
} {
  const porServicio = new Map<string, ElementoBd>();
  const excluidos = new Set<string>();
  for (const c of contenedores) {
    const motor = motorDe(c.imagen);
    if (!motor) continue;
    const previo = porServicio.get(c.servicio);
    if (!previo || (!previo.enMarcha && c.enMarcha))
      porServicio.set(c.servicio, {
        tipo: "bd",
        clave: `bd:${c.servicio}`,
        servicio: c.servicio,
        motor,
        contenedorId: c.id,
        enMarcha: c.enMarcha,
      });
    const dir = directorioBd(c, motor);
    // Also a parent of the data dir: Postgres 18 mounts /var/lib/postgresql
    // with PGDATA=/var/lib/postgresql/18/docker.
    for (const m of c.montajes)
      if (relativa(limpia(m.destino), dir) !== null)
        excluidos.add(identidad(m));
  }
  return { bds: [...porServicio.values()], excluidos };
}

export async function detectarElementos(
  contenedores: ContenedorInspeccionado[],
  ctx: Contexto,
): Promise<Deteccion> {
  if (contenedores.length === 0) return SIN_DETECTAR;
  const { bds, excluidos } = detectarBds(contenedores);
  const datos: ElementoDatos[] = [];
  const noCopiados: NoCopiado[] = [];
  const vistos = new Set<string>();
  for (const m of contenedores.flatMap((c) => c.montajes)) {
    if (!m.rw) continue;
    const id = identidad(m);
    if (vistos.has(id) || excluidos.has(id)) continue;
    vistos.add(id);
    const r = await clasificar(m, ctx);
    if (r.tipo === "elemento") datos.push(r.elemento);
    else if (r.tipo === "no_copiado")
      noCopiados.push({ origen: id, motivo: r.motivo });
  }
  return { valida: true, elementos: [...bds, ...datos], noCopiados };
}

export async function detectarProyecto(
  clienteSlug: string,
  proyectoNombre: string,
): Promise<Deteccion> {
  try {
    const contenedores = await inspeccionarProyecto(
      clienteSlug,
      proyectoNombre,
    );
    return await detectarElementos(contenedores, {
      reposDir: env.REPOS_DIR,
      clienteSlug,
      proyectoNombre,
      etiquetasVolumen,
      comprobarRuta: (origen) => comprobarRuta(origen),
    });
  } catch (err) {
    log.warn(
      { err, clienteSlug, proyectoNombre },
      "No se pudieron detectar los elementos del Proyecto",
    );
    return SIN_DETECTAR;
  }
}
