import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashClave } from "./comandos";
import type { Deteccion } from "./deteccion";
import type { Proceso } from "./procesos";
import type { SnapshotProyecto } from "./restic";

const m = vi.hoisted(() => ({
  proyecto: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  elementosUpdateMany: vi.fn(),
  notificar: vi.fn(),
  cargar: vi.fn(),
  snapshots: vi.fn(),
  detectar: vi.fn(),
  comprobarRuta: vi.fn(),
  copiarProyecto: vi.fn(),
  ejecutar: vi.fn(),
  encadenar: vi.fn(),
  listarServicios: vi.fn(),
  iniciar: vi.fn(),
  detener: vi.fn(),
  eliminarAuxiliar: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    proyecto: { findUnique: m.proyecto },
    backup: { create: m.create, update: m.update },
    elementoCopia: { updateMany: m.elementosUpdateMany },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ error: m.error, warn: m.warn, info: vi.fn() }) },
}));
vi.mock("@/lib/notificaciones", () => ({ notificarFalloBackup: m.notificar }));
vi.mock("@/lib/docker/proyectos", () => ({
  listarServicios: m.listarServicios,
  iniciarProyecto: m.iniciar,
  detenerProyecto: m.detener,
}));
vi.mock("./configuracion", () => ({
  cargarConfigResuelta: m.cargar,
  conRestic: (_c: unknown, signal: AbortSignal, fn: (r: unknown) => unknown) =>
    fn({ env: { RESTIC: "1" }, args: ["-r", "repo"], signal }),
}));
vi.mock("./restic", () => ({
  LIMITE_CONSULTA_MS: 30_000,
  listarSnapshotsProyectos: m.snapshots,
  volcarSnapshot: (
    r: { args: string[]; env: Record<string, string> },
    id: string,
    ruta: string,
  ): Proceso => ({
    comando: "restic",
    args: [...r.args, "dump", id, ruta],
    env: r.env,
  }),
}));
vi.mock("./deteccion", () => ({ detectarProyecto: m.detectar }));
vi.mock("./rutaSegura", () => ({ comprobarRuta: m.comprobarRuta }));
vi.mock("./copiaProyecto", () => ({
  LIMITE_BD_MS: 60 * 60 * 1000,
  LIMITE_DATOS_MS: 12 * 60 * 60 * 1000,
  copiarProyecto: m.copiarProyecto,
}));
vi.mock("./procesos", () => ({
  ejecutar: m.ejecutar,
  encadenar: m.encadenar,
}));
vi.mock("./auxiliar", () => ({
  nombreAuxiliar: (backupId: string, clave: string) =>
    `aux-${backupId}-${clave}`,
  eliminarAuxiliar: m.eliminarAuxiliar,
}));

import {
  DeployEnCurso,
  RestauracionRechazada,
  iniciarRestauracionProyecto,
} from "./restaurarProyecto";
import {
  OperacionEnCurso,
  cancelarOperacion,
  hayOperacionEnCurso,
  soltarOperacion,
  tomarOperacion,
} from "./operacion";
import {
  ProyectoRestaurando,
  desmarcarRestaurando,
  estaRestaurando,
  marcarRestaurando,
} from "./restaurando";

const AVISO =
  "Los Servicios de acme/web se han quedado parados. Restaura otra vez (la copia previa está en la lista) o arráncalos a mano.";
const ROLES_SQL = "CREATE ROLE app;\nALTER ROLE app WITH PASSWORD 'x';\nCREATE ROLE lector;\n";

const PROYECTO = {
  id: "p1",
  nombre: "web",
  estado: "running",
  cliente: { slug: "acme" },
};

const bd = {
  tipo: "bd" as const,
  clave: "bd:db",
  servicio: "db",
  motor: "postgres" as const,
  contenedorId: "c-db",
  enMarcha: true,
};
const datos = {
  tipo: "datos" as const,
  clave: "datos:./data",
  origen: "/repos/acme/web/data",
  montaje: "bind" as const,
  restaurable: true,
};
const mysql = {
  tipo: "bd" as const,
  clave: "bd:maria",
  servicio: "maria",
  motor: "mysql" as const,
  contenedorId: "c-maria",
  enMarcha: true,
};
const panel = {
  tipo: "datos" as const,
  clave: "datos:.panel/subidas",
  origen: "/repos/acme/.panel/subidas",
  montaje: "bind" as const,
  restaurable: false,
};
const volumen = {
  tipo: "datos" as const,
  clave: "volumen:acme-web_fotos",
  origen: "acme-web_fotos",
  montaje: "volume" as const,
  restaurable: true,
};

function deteccion(...elementos: Deteccion["elementos"]): Deteccion {
  return { valida: true, elementos, noCopiados: [] };
}

function snap(
  id: string,
  clave: string,
  ruta: string,
  backupId = "c1",
): SnapshotProyecto {
  return {
    id,
    fecha: new Date("2026-10-27T03:00:00Z"),
    bytes: 10,
    ruta,
    proyectoId: "p1",
    hashElemento: hashClave(clave),
    backupId,
    origen: "programado",
  };
}

const SNAPSHOTS: SnapshotProyecto[] = [
  snap("s-app", "bd:db", "/bd/db/app.sql"),
  snap("s-roles", "bd:db", "/bd/db/_roles.sql"),
  snap("s-postgres", "bd:db", "/bd/db/postgres.sql"),
  snap("s-datos", "datos:./data", "/datos/datos%3A.%2Fdata.tar"),
  snap("s-maria", "bd:maria", "/bd/maria/todo.sql"),
  snap("s-panel", "datos:.panel/subidas", "/datos/x.tar"),
  snap("s-vol", "volumen:acme-web_fotos", "/datos/v.tar"),
  snap("s-otra", "bd:db", "/bd/db/app.sql", "c0"),
];

// Every Docker/process call in order, so tests can assert the exact sequence.
let llamadas: string[] = [];

function guion(p: Proceso | { comando: string; args: string[] }): string {
  return p.args[p.args.length - 1] ?? "";
}

function etiqueta(cmd: string, args: string[]): string {
  if (cmd === "restic") return `volcar:${args[3]}`;
  const script = args[args.length - 1] ?? "";
  if (script.includes("pg_isready")) return `esperar:${args[1]}`;
  if (script.includes("mariadb-admin")) return `esperar:${args[1]}`;
  if (script.startsWith("printf")) return `superusuario:${args[1]}`;
  if (script.includes("psql")) return `roles:${args[2]}`;
  return `${cmd} ${args.join(" ")}`;
}

function destinoDe(p: Proceso): string {
  if (p.args[0] === "run") return `extraer:${p.args[p.args.indexOf("-v") + 1]}`;
  const s = guion(p);
  if (s.includes("ON_ERROR_STOP")) return `psql:${p.args[2]}`;
  if (s.includes('"$CLI" -uroot')) return `mysql:${p.args[2]}`;
  return "?";
}

const terminado = () =>
  vi.waitFor(() => expect(hayOperacionEnCurso()).toBe(false));

const peticion = (claves: string[], copiaId = "c1") => ({
  proyectoId: "p1",
  copiaId,
  claves,
});

beforeEach(() => {
  vi.clearAllMocks();
  soltarOperacion();
  desmarcarRestaurando("p1");
  llamadas = [];
  m.proyecto.mockResolvedValue(PROYECTO);
  m.cargar.mockResolvedValue({ clave: "k", destino: { tipo: "s3" } });
  m.snapshots.mockResolvedValue(SNAPSHOTS);
  m.detectar.mockResolvedValue(deteccion(bd, datos, mysql, panel, volumen));
  m.comprobarRuta.mockResolvedValue("ok");
  m.create.mockImplementation(async ({ data }: { data: { origen: string } }) => ({
    id: data.origen === "antes_de_restaurar" ? "previa" : "rest",
  }));
  m.update.mockResolvedValue({});
  m.elementosUpdateMany.mockResolvedValue({ count: 0 });
  m.notificar.mockResolvedValue(undefined);
  m.listarServicios.mockResolvedValue([
    { servicio: "db", estado: "running", detalle: "Up 2 hours" },
    { servicio: "maria", estado: "running", detalle: "Up 2 hours" },
    { servicio: "web", estado: "running", detalle: "Up 2 hours" },
    { servicio: "worker", estado: "stopped", detalle: "Exited (0)" },
  ]);
  m.iniciar.mockImplementation(async (_c: string, _n: string, s?: string) => {
    llamadas.push(`iniciar:${s ?? "todos"}`);
  });
  m.detener.mockImplementation(async (_c: string, _n: string, s?: string) => {
    llamadas.push(`detener:${s ?? "todos"}`);
  });
  m.copiarProyecto.mockImplementation(
    async (a: { soloClaves: string[] }) => {
      llamadas.push(`copia_previa:${a.soloClaves.join(",")}`);
      return a.soloClaves.map((clave) => ({ clave, ok: true }));
    },
  );
  m.ejecutar.mockImplementation(
    async (cmd: string, args: string[], o: { entrada?: string }) => {
      const e = etiqueta(cmd, args);
      llamadas.push(o.entrada === undefined ? e : `${e}<<${o.entrada}`);
      if (e.startsWith("volcar:")) return ROLES_SQL;
      if (e.startsWith("superusuario:")) return "app";
      return "";
    },
  );
  m.encadenar.mockImplementation(async (origen: Proceso, destino: Proceso) => {
    llamadas.push(`${origen.args[3]}->${destinoDe(destino)}`);
    return "";
  });
  m.eliminarAuxiliar.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("iniciarRestauracionProyecto — orden", () => {
  it("BD + datos: espera, copia previa, detiene, extrae, roles, bases y arranca", async () => {
    expect(
      await iniciarRestauracionProyecto(peticion(["datos:./data", "bd:db"])),
    ).toEqual({ id: "rest" });
    expect(estaRestaurando("p1")).toBe(true);
    await terminado();

    expect(llamadas).toEqual([
      "esperar:c-db",
      "copia_previa:datos:./data,bd:db",
      "detener:maria",
      "detener:web",
      "s-datos->extraer:/repos/acme/web/data:/datos",
      "volcar:s-roles",
      "superusuario:c-db",
      "roles:c-db<<\n\nCREATE ROLE lector;\n",
      "s-app->psql:c-db",
      "s-postgres->psql:c-db",
      "iniciar:db",
      "iniciar:maria",
      "iniciar:web",
    ]);
    expect(m.create).toHaveBeenCalledWith({
      data: {
        operacion: "restauracion",
        origen: "manual",
        proyectoId: "p1",
        proyectoNombre: "acme/web",
      },
    });
    expect(m.create).toHaveBeenCalledWith({
      data: {
        operacion: "copia",
        origen: "antes_de_restaurar",
        proyectoId: "p1",
        proyectoNombre: "acme/web",
      },
    });
    expect(m.copiarProyecto).toHaveBeenCalledWith(
      expect.objectContaining({
        proyecto: { id: "p1", nombre: "web", clienteSlug: "acme" },
        backupId: "previa",
        origen: "antes_de_restaurar",
        soloClaves: ["datos:./data", "bd:db"],
        restic: expect.objectContaining({ signal: expect.any(AbortSignal) }),
      }),
    );
    expect(m.ejecutar).toHaveBeenCalledWith(
      "docker",
      ["exec", "c-db", "sh", "-c", 'printf %s "${POSTGRES_USER:-postgres}"'],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(m.eliminarAuxiliar).toHaveBeenCalledWith("aux-rest-datos:./data");
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "previa" },
      data: { resultado: "exito", finalizadoEn: expect.any(Date) },
    });
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "rest" },
      data: { resultado: "exito", finalizadoEn: expect.any(Date) },
    });
    expect(m.notificar).not.toHaveBeenCalled();
    expect(estaRestaurando("p1")).toBe(false);
  });

  it("MySQL: restaura todo.sql en su contenedor", async () => {
    await iniciarRestauracionProyecto(peticion(["bd:maria"]));
    await terminado();
    expect(llamadas).toContain("s-maria->mysql:c-maria");
    expect(llamadas[0]).toBe("esperar:c-maria");
  });

  it("volumen con nombre: no recomprueba la ruta y extrae en el volumen", async () => {
    await iniciarRestauracionProyecto(peticion(["volumen:acme-web_fotos"]));
    await terminado();
    expect(m.comprobarRuta).not.toHaveBeenCalled();
    expect(llamadas).toContain("s-vol->extraer:acme-web_fotos:/datos");
  });

  it("un Servicio unhealthy (Up) cuenta como en marcha y se vuelve a arrancar", async () => {
    m.listarServicios.mockResolvedValue([
      { servicio: "db", estado: "running", detalle: "Up 1 hour" },
      { servicio: "web", estado: "error", detalle: "Up 1 hour (unhealthy)" },
    ]);
    m.detectar.mockResolvedValue(deteccion(bd, datos));
    await iniciarRestauracionProyecto(peticion(["datos:./data"]));
    await terminado();
    expect(llamadas).toContain("detener:web");
    expect(llamadas.at(-1)).toBe("iniciar:web");
  });

  it("BD parada al empezar: se arranca, se espera, se copia con ella en marcha y al final se vuelve a parar", async () => {
    m.detectar.mockResolvedValue(
      deteccion({ ...bd, enMarcha: false }, datos),
    );
    m.listarServicios.mockResolvedValue([
      { servicio: "db", estado: "stopped", detalle: "Exited (0)" },
      { servicio: "web", estado: "running", detalle: "Up 2 hours" },
    ]);
    await iniciarRestauracionProyecto(peticion(["bd:db"]));
    await terminado();

    expect(llamadas.slice(0, 3)).toEqual([
      "iniciar:db",
      "esperar:c-db",
      "copia_previa:bd:db",
    ]);
    expect(llamadas.slice(-2)).toEqual(["iniciar:web", "detener:db"]);
    const previa = m.copiarProyecto.mock.calls[0]![0] as {
      deteccion: Deteccion;
      incluidos: (clave: string) => boolean;
    };
    expect(previa.deteccion.elementos[0]).toMatchObject({
      clave: "bd:db",
      enMarcha: true,
    });
    expect(previa.incluidos("bd:db")).toBe(true);
    expect(previa.incluidos("datos:./data")).toBe(false);
  });
});

describe("iniciarRestauracionProyecto — esperar a la BD", () => {
  it("cancelada mientras espera entre intentos → no copia ni toca nada", async () => {
    vi.useFakeTimers();
    m.ejecutar.mockRejectedValue(new Error("no acepta conexiones"));
    await iniciarRestauracionProyecto(peticion(["bd:db"]));
    await vi.advanceTimersByTimeAsync(1_000);
    cancelarOperacion("Cancelado por ana");
    await terminado();
    expect(m.copiarProyecto).not.toHaveBeenCalled();
    expect(m.detener).not.toHaveBeenCalled();
    expect(m.notificar).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Cancelado por ana" }),
    );
  });

  it("cancelada durante un intento → no reintenta", async () => {
    m.ejecutar.mockImplementation(async () => {
      cancelarOperacion("Cancelado por ana");
      const err = new Error("docker cancelado");
      err.name = "AbortError";
      throw err;
    });
    await iniciarRestauracionProyecto(peticion(["bd:db"]));
    await terminado();
    expect(m.ejecutar).toHaveBeenCalledTimes(1);
    expect(m.notificar).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Cancelado por ana" }),
    );
  });

  it("reintenta cada 2 s hasta que acepta conexiones", async () => {
    vi.useFakeTimers();
    let intentos = 0;
    const base = m.ejecutar.getMockImplementation()!;
    m.ejecutar.mockImplementation(async (cmd: string, args: string[], o) => {
      if (etiqueta(cmd, args).startsWith("esperar:") && ++intentos < 3) {
        throw new Error("no acepta conexiones");
      }
      return base(cmd, args, o);
    });
    await iniciarRestauracionProyecto(peticion(["bd:db"]));
    await vi.advanceTimersByTimeAsync(4_000);
    await terminado();
    expect(intentos).toBe(3);
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "rest" },
      data: { resultado: "exito", finalizadoEn: expect.any(Date) },
    });
  });

  it("tras 2 minutos falla sin copiar ni tocar nada y vuelve a parar la BD que arrancó", async () => {
    vi.useFakeTimers();
    m.detectar.mockResolvedValue(deteccion({ ...bd, enMarcha: false }));
    m.ejecutar.mockRejectedValue(new Error("no acepta conexiones"));
    await iniciarRestauracionProyecto(peticion(["bd:db"]));
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000 + 2_000);
    await terminado();

    expect(m.ejecutar.mock.calls.length).toBeGreaterThan(50);
    expect(m.copiarProyecto).not.toHaveBeenCalled();
    expect(m.encadenar).not.toHaveBeenCalled();
    expect(llamadas).toEqual(["iniciar:db", "detener:db"]);
    const error = "db no acepta conexiones tras 2 minutos";
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "rest" },
      data: { resultado: "error", error, finalizadoEn: expect.any(Date) },
    });
    expect(m.notificar).toHaveBeenCalledWith({
      operacion: "restauracion",
      origen: "manual",
      error,
      proyecto: "acme/web",
    });
  });
});

describe("iniciarRestauracionProyecto — fallos", () => {
  it("falla la copia previa → no se detiene ni restaura nada", async () => {
    m.copiarProyecto.mockResolvedValue([
      { clave: "bd:db", ok: false, error: "403 Forbidden" },
    ]);
    await iniciarRestauracionProyecto(peticion(["bd:db", "datos:./data"]));
    await terminado();

    expect(m.detener).not.toHaveBeenCalled();
    expect(m.iniciar).not.toHaveBeenCalled();
    expect(m.encadenar).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "previa" },
      data: {
        resultado: "error",
        error: "bd:db: 403 Forbidden",
        finalizadoEn: expect.any(Date),
      },
    });
    const error = "No se restauró: falló la copia previa (bd:db: 403 Forbidden)";
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "rest" },
      data: { resultado: "error", error, finalizadoEn: expect.any(Date) },
    });
    expect(m.notificar).toHaveBeenCalledWith(
      expect.objectContaining({ operacion: "restauracion", error }),
    );
    expect(estaRestaurando("p1")).toBe(false);
  });

  it("la copia previa lanza (destino caído) → no se toca nada", async () => {
    m.copiarProyecto.mockRejectedValue(new Error("repositorio no responde"));
    await iniciarRestauracionProyecto(peticion(["bd:db"]));
    await terminado();
    expect(m.detener).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "previa" },
      data: {
        resultado: "error",
        error: "repositorio no responde",
        finalizadoEn: expect.any(Date),
      },
    });
  });

  it("un elemento de la copia previa sin cerrar cuenta como fallo", async () => {
    m.elementosUpdateMany.mockResolvedValue({ count: 1 });
    await iniciarRestauracionProyecto(peticion(["bd:db"]));
    await terminado();
    expect(m.elementosUpdateMany).toHaveBeenCalledWith({
      where: { backupId: "previa", resultado: "en_curso" },
      data: {
        resultado: "error",
        error: "No se pudo registrar el resultado del elemento",
      },
    });
    expect(m.encadenar).not.toHaveBeenCalled();
    expect(m.detener).not.toHaveBeenCalled();
  });

  it("falla la restauración de una base → Servicios parados, sin arrancar, aviso con el texto", async () => {
    m.encadenar.mockImplementation(async (origen: Proceso) => {
      llamadas.push(`${origen.args[3]}`);
      if (origen.args[3] === "s-app")
        throw new Error("psql terminó con código 3");
    });
    await iniciarRestauracionProyecto(peticion(["bd:db"]));
    await terminado();

    expect(llamadas).not.toContain("s-postgres");
    expect(llamadas.at(-1)).toBe("detener:todos");
    expect(m.iniciar).not.toHaveBeenCalled();
    const error = `bd:db: psql terminó con código 3\n${AVISO}`;
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "rest" },
      data: { resultado: "error", error, finalizadoEn: expect.any(Date) },
    });
    expect(m.notificar).toHaveBeenCalledWith({
      operacion: "restauracion",
      origen: "manual",
      error,
      proyecto: "acme/web",
    });
    expect(estaRestaurando("p1")).toBe(false);
    expect(hayOperacionEnCurso()).toBe(false);
  });

  it("si al fallar no se pueden parar los Servicios, lo registra y avisa igual", async () => {
    m.encadenar.mockRejectedValue(new Error("tar terminó con código 1"));
    m.detener.mockImplementation(async (_c: string, _n: string, s?: string) => {
      if (!s) throw new Error("daemon caído");
    });
    await iniciarRestauracionProyecto(peticion(["datos:./data"]));
    await terminado();
    expect(m.warn).toHaveBeenCalled();
    expect(m.notificar).toHaveBeenCalledWith(
      expect.objectContaining({
        error: `datos:./data: tar terminó con código 1\n${AVISO}`,
      }),
    );
  });

  it("si no se puede eliminar el auxiliar, solo lo registra", async () => {
    m.eliminarAuxiliar.mockRejectedValue(new Error("daemon"));
    await iniciarRestauracionProyecto(peticion(["datos:./data"]));
    await terminado();
    expect(m.warn).toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "rest" },
      data: { resultado: "exito", finalizadoEn: expect.any(Date) },
    });
  });

  it("si no se puede volver a parar la BD tras fallar la espera, lo registra", async () => {
    vi.useFakeTimers();
    m.detectar.mockResolvedValue(deteccion({ ...bd, enMarcha: false }));
    m.ejecutar.mockRejectedValue(new Error("no"));
    m.detener.mockRejectedValue(new Error("daemon caído"));
    await iniciarRestauracionProyecto(peticion(["bd:db"]));
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000 + 2_000);
    await terminado();
    expect(m.warn).toHaveBeenCalled();
    expect(m.notificar).toHaveBeenCalled();
  });

  it("si falla el registro, se avisa igual y se suelta todo", async () => {
    m.encadenar.mockRejectedValue(new Error("tar"));
    m.update.mockRejectedValue(new Error("BD caída"));
    await iniciarRestauracionProyecto(peticion(["datos:./data"]));
    await terminado();
    expect(m.notificar).toHaveBeenCalled();
    expect(m.error).toHaveBeenCalled();
    expect(estaRestaurando("p1")).toBe(false);
  });

  it("cancelada → Servicios parados y el motivo en el aviso", async () => {
    m.encadenar.mockImplementation(
      (_o: Proceso, _d: Proceso, { signal }: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => {
            const err = new Error("restic cancelado");
            err.name = "AbortError";
            reject(err);
          });
          cancelarOperacion("Cancelado por ana");
        }),
    );
    await iniciarRestauracionProyecto(peticion(["datos:./data", "bd:db"]));
    await terminado();
    expect(m.detener).toHaveBeenCalledWith("acme", "web");
    expect(m.iniciar).not.toHaveBeenCalled();
    expect(m.encadenar).toHaveBeenCalledTimes(1);
    expect(m.notificar).toHaveBeenCalledWith(
      expect.objectContaining({
        error: `datos:./data: Cancelado por ana\n${AVISO}`,
      }),
    );
  });

  it("cancelada justo tras la copia previa → no se restaura nada y se avisa", async () => {
    m.copiarProyecto.mockImplementation(async (a: { soloClaves: string[] }) => {
      cancelarOperacion("Cancelado por ana");
      return a.soloClaves.map((clave) => ({ clave, ok: true }));
    });
    await iniciarRestauracionProyecto(peticion(["bd:db"]));
    await terminado();
    expect(m.encadenar).not.toHaveBeenCalled();
    expect(m.notificar).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Cancelado por ana" }),
    );
  });

  it("supera el límite de un elemento → lo dice el motivo", async () => {
    vi.useFakeTimers();
    m.encadenar.mockImplementation(
      (_o: Proceso, _d: Proceso, { signal }: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => {
            const err = new Error("restic cancelado");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );
    await iniciarRestauracionProyecto(peticion(["datos:./data"]));
    await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000);
    await terminado();
    expect(m.notificar).toHaveBeenCalledWith(
      expect.objectContaining({
        error: `datos:./data: Cancelado: datos:./data superó 12 horas\n${AVISO}`,
      }),
    );
  });
});

describe("iniciarRestauracionProyecto — validación antes del bloqueo", () => {
  async function rechaza(
    p: ReturnType<typeof peticion>,
    tipo: typeof Error,
    mensaje: string,
  ) {
    const promesa = iniciarRestauracionProyecto(p);
    await expect(promesa).rejects.toThrow(mensaje);
    await expect(promesa).rejects.toBeInstanceOf(tipo);
    expect(hayOperacionEnCurso()).toBe(false);
    expect(estaRestaurando("p1")).toBe(false);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.detener).not.toHaveBeenCalled();
  }

  it("clave que ya no se monta en el Proyecto", async () => {
    m.detectar.mockResolvedValue(deteccion(bd));
    await rechaza(
      peticion(["bd:db", "datos:./data"]),
      RestauracionRechazada,
      "datos:./data ya no se monta en el Proyecto",
    );
  });

  it("clave de .panel/", async () => {
    await rechaza(
      peticion(["datos:.panel/subidas"]),
      RestauracionRechazada,
      "Se restaura a mano: ver docs/recuperacion.md",
    );
  });

  it("la recomprobación de la ruta encuentra un enlace", async () => {
    m.comprobarRuta.mockResolvedValue("enlace");
    await rechaza(
      peticion(["datos:./data"]),
      RestauracionRechazada,
      "datos:./data: contiene un enlace simbólico",
    );
    expect(m.comprobarRuta).toHaveBeenCalledWith("/repos/acme/web/data");
  });

  it("clave que no está en esa copia", async () => {
    await rechaza(
      peticion(["bd:db"], "c0x"),
      RestauracionRechazada,
      "bd:db no está en esa copia",
    );
  });

  it("deploy en curso", async () => {
    m.proyecto.mockResolvedValue({ ...PROYECTO, estado: "deploying" });
    await rechaza(peticion(["bd:db"]), DeployEnCurso, "Hay un deploy en curso");
  });

  it("Proyecto inexistente", async () => {
    m.proyecto.mockResolvedValue(null);
    await rechaza(
      peticion(["bd:db"]),
      RestauracionRechazada,
      "El Proyecto no existe",
    );
  });

  it("sin elementos", async () => {
    await rechaza(
      peticion([]),
      RestauracionRechazada,
      "Elige al menos un elemento que restaurar",
    );
  });

  it("otra operación de backups en curso", async () => {
    tomarOperacion();
    await expect(
      iniciarRestauracionProyecto(peticion(["bd:db"])),
    ).rejects.toBeInstanceOf(OperacionEnCurso);
    expect(estaRestaurando("p1")).toBe(false);
    expect(m.create).not.toHaveBeenCalled();
  });

  it("ya se está restaurando → suelta el bloqueo", async () => {
    marcarRestaurando("p1");
    await expect(
      iniciarRestauracionProyecto(peticion(["bd:db"])),
    ).rejects.toBeInstanceOf(ProyectoRestaurando);
    expect(hayOperacionEnCurso()).toBe(false);
    expect(estaRestaurando("p1")).toBe(true);
  });

  it("si no se pueden crear las filas, suelta el bloqueo y la marca", async () => {
    m.create.mockRejectedValue(new Error("BD caída"));
    await expect(
      iniciarRestauracionProyecto(peticion(["bd:db"])),
    ).rejects.toThrow("BD caída");
    expect(hayOperacionEnCurso()).toBe(false);
    expect(estaRestaurando("p1")).toBe(false);
  });
});
