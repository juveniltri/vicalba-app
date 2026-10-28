import { createHash } from "node:crypto";
import type { MotorBd } from "./deteccion";
import type { Proceso } from "./procesos";

export type OrigenCopia = "programado" | "manual" | "antes_de_restaurar";

export const IMAGEN_AUXILIAR = "busybox:1.37.0";

export function hashClave(clave: string): string {
  return createHash("sha256").update(clave).digest("hex").slice(0, 12);
}

export function etiquetasCopia(p: {
  proyectoId: string;
  clave: string;
  backupId: string;
  origen: OrigenCopia;
}): string[] {
  return [
    "proyecto",
    `p:${p.proyectoId}`,
    `e:${hashClave(p.clave)}`,
    `c:${p.backupId}`,
    `o:${p.origen}`,
  ];
}

export function citarSh(valor: string): string {
  return `'${valor.replace(/'/g, `'\\''`)}'`;
}

function segmento(valor: string): string {
  const codificado = encodeURIComponent(valor);
  if (codificado === "" || /^\.+$/.test(codificado)) {
    throw new Error(`Nombre no válido para una copia: «${valor}»`);
  }
  return codificado;
}

// A database called "_roles" must not collide with the roles file.
function segmentoBase(base: string): string {
  return segmento(base).replace(/^_/, "%5F");
}

export function nombreStdin(
  p:
    | { tipo: "pg_base"; servicio: string; base: string }
    | { tipo: "pg_roles"; servicio: string }
    | { tipo: "mysql"; servicio: string }
    | { tipo: "datos"; clave: string },
): string {
  switch (p.tipo) {
    case "pg_base":
      return `/bd/${segmento(p.servicio)}/${segmentoBase(p.base)}.sql`;
    case "pg_roles":
      return `/bd/${segmento(p.servicio)}/_roles.sql`;
    case "mysql":
      return `/bd/${segmento(p.servicio)}/todo.sql`;
    case "datos":
      return `/datos/${segmento(p.clave)}.tar`;
  }
}

export function claveDeRuta(ruta: string): string {
  const bd = /^\/bd\/([^/]+)\/[^/]+\.sql$/.exec(ruta);
  if (bd) return `bd:${decodeURIComponent(bd[1])}`;
  const datos = /^\/datos\/([^/]+)\.tar$/.exec(ruta);
  if (datos) return decodeURIComponent(datos[1]);
  throw new Error(`Ruta de copia no reconocida: ${ruta}`);
}

const USUARIO_PG = '"${POSTGRES_USER:-postgres}"';

function exec(contenedorId: string, script: string, stdin = false): Proceso {
  return {
    comando: "docker",
    args: ["exec", ...(stdin ? ["-i"] : []), contenedorId, "sh", "-c", script],
  };
}

export function procesoListarBasesPg(contenedorId: string): Proceso {
  return exec(
    contenedorId,
    `psql -U ${USUARIO_PG} -d postgres -Atc "select datname from pg_database where not datistemplate"`,
  );
}

export function procesoDumpPg(contenedorId: string, base: string): Proceso {
  // The connected database cannot be recreated, so "postgres" skips --create.
  const crear = base === "postgres" ? "" : " --create";
  return exec(
    contenedorId,
    `pg_dump -U ${USUARIO_PG} -d ${citarSh(base)} --clean --if-exists${crear}`,
  );
}

export function procesoRolesPg(contenedorId: string): Proceso {
  return exec(
    contenedorId,
    `pg_dumpall -U ${USUARIO_PG} -d postgres --globals-only`,
  );
}

export function procesoRestaurarPg(contenedorId: string): Proceso {
  return exec(
    contenedorId,
    `exec psql -U ${USUARIO_PG} -d postgres -v ON_ERROR_STOP=1`,
    true,
  );
}

// "Already exists" errors are expected when replaying roles over a live server.
export function procesoRestaurarRolesPg(contenedorId: string): Proceso {
  return exec(contenedorId, `exec psql -U ${USUARIO_PG} -d postgres`, true);
}

// mariadb:11 images ship mariadb-* binaries only; older ones only mysql*.
function preludioMysql(
  binarios: [alias: string, mariadb: string, mysql: string][],
): string {
  const elegir = binarios.map(
    ([alias, mariadb, mysql]) =>
      `${alias}=${mysql}; command -v ${mariadb} >/dev/null 2>&1 && ${alias}=${mariadb}`,
  );
  return [
    ...elegir,
    'MYSQL_PWD="${MARIADB_ROOT_PASSWORD:-$MYSQL_ROOT_PASSWORD}"',
    'if [ -z "$MYSQL_PWD" ]; then echo "No se encuentra la contraseña de root en el entorno del contenedor" >&2; exit 64; fi',
    "export MYSQL_PWD",
  ].join("\n");
}

export function procesoDumpMysql(contenedorId: string): Proceso {
  const script = [
    preludioMysql([
      ["DUMP", "mariadb-dump", "mysqldump"],
      ["CLI", "mariadb", "mysql"],
    ]),
    'LISTA=$("$CLI" -uroot -N -e "show databases" | grep -vx -e mysql -e sys -e performance_schema -e information_schema)',
    'if [ -z "$LISTA" ]; then echo "No hay bases de datos que copiar" >&2; exit 65; fi',
    // Names may contain spaces: split on newlines only, without globbing.
    "NL='\n'",
    'IFS="$NL"; set -f; set -- $LISTA; unset IFS',
    'exec "$DUMP" -uroot --databases "$@" --add-drop-database --single-transaction --routines --events --triggers',
  ].join("\n");
  return exec(contenedorId, script);
}

export function procesoRestaurarMysql(contenedorId: string): Proceso {
  const script = [
    preludioMysql([["CLI", "mariadb", "mysql"]]),
    'exec "$CLI" -uroot',
  ].join("\n");
  return exec(contenedorId, script, true);
}

export function procesoEsperarBd(
  contenedorId: string,
  motor: MotorBd,
): Proceso {
  if (motor === "postgres") {
    return exec(contenedorId, `pg_isready -U ${USUARIO_PG} -d postgres`);
  }
  const script = [
    preludioMysql([["ADMIN", "mariadb-admin", "mysqladmin"]]),
    'exec "$ADMIN" -uroot ping',
  ].join("\n");
  return exec(contenedorId, script);
}

// ":" would let a crafted path add mount options to -v.
function montaje(origen: string, sufijo: string): string {
  if (origen.includes(":")) {
    throw new Error(`Origen de datos no válido: «${origen}»`);
  }
  return `${origen}:/datos${sufijo}`;
}

export function procesoTarDatos(
  nombreAuxiliar: string,
  origen: string,
): Proceso {
  return {
    comando: "docker",
    args: [
      "run",
      "--rm",
      "--name",
      nombreAuxiliar,
      "-v",
      montaje(origen, ":ro"),
      IMAGEN_AUXILIAR,
      "tar",
      "--numeric-owner",
      "-cf",
      "-",
      "-C",
      "/datos",
      ".",
    ],
  };
}

export function procesoExtraerDatos(
  nombreAuxiliar: string,
  origen: string,
): Proceso {
  return {
    comando: "docker",
    args: [
      "run",
      "--rm",
      "-i",
      "--name",
      nombreAuxiliar,
      "-v",
      montaje(origen, ""),
      IMAGEN_AUXILIAR,
      "sh",
      "-c",
      "find /datos -mindepth 1 -delete && tar --numeric-owner -xf - -C /datos",
    ],
  };
}

const IDENT = String.raw`("(?:[^"]|"")*"|[^\s;",]+)`;

function nombreIdent(ident: string): string {
  return ident.startsWith('"')
    ? ident.slice(1, -1).replace(/""/g, '"')
    : ident.toLowerCase();
}

function identificadores(trozo: string): string[] {
  return [...trozo.matchAll(new RegExp(IDENT, "g"))].map((m) =>
    nombreIdent(m[1]),
  );
}

function sentenciaDelRol(sentencia: string, rol: string): boolean {
  const cabecera = new RegExp(
    String.raw`^(?:(?:CREATE|ALTER)\s+(?:ROLE|USER)|COMMENT\s+ON\s+ROLE)\s+${IDENT}`,
    "i",
  ).exec(sentencia);
  if (cabecera) return nombreIdent(cabecera[1]) === rol;
  const grant = /^GRANT\s+([\s\S]*?)\s+TO\s+([\s\S]*)$/i.exec(sentencia);
  if (grant && !/\sON\s/i.test(` ${grant[1]} `)) {
    const grantees = grant[2].split(/\s+(?:WITH|GRANTED)\s/i)[0];
    return [
      ...identificadores(grant[1]),
      ...identificadores(grantees),
    ].includes(rol);
  }
  return false;
}

// Splits at ";" outside quotes and "--" comments.
function sentencias(sql: string): string[] {
  const trozos: string[] = [];
  let inicio = 0;
  let comilla: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (comilla) {
      if (c === comilla) comilla = null;
    } else if (c === "'" || c === '"') {
      comilla = c;
    } else if (c === "-" && sql[i + 1] === "-") {
      const fin = sql.indexOf("\n", i);
      i = fin === -1 ? sql.length : fin;
    } else if (c === ";") {
      trozos.push(sql.slice(inicio, i + 1));
      inicio = i + 1;
    }
  }
  trozos.push(sql.slice(inicio));
  return trozos;
}

// The container's own user is recreated by the image from its environment: its
// ALTER ROLE ... PASSWORD would leave the old password in place.
export function filtrarRolesSql(sql: string, rol: string): string {
  const objetivo = /^".*"$/.test(rol) ? nombreIdent(rol) : rol;
  return sentencias(sql)
    .map((trozo) => {
      const cabecera = trozo.match(/^(?:\s|--[^\n]*)*/)![0];
      const sentencia = trozo.slice(cabecera.length);
      return sentenciaDelRol(sentencia, objetivo) ? cabecera : trozo;
    })
    .join("");
}
