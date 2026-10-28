import { describe, expect, it } from "vitest";
import {
  citarSh,
  claveDeRuta,
  etiquetasCopia,
  filtrarRolesSql,
  hashClave,
  nombreStdin,
  procesoDumpMysql,
  procesoDumpPg,
  procesoEsperarBd,
  procesoExtraerDatos,
  procesoListarBasesPg,
  procesoRestaurarMysql,
  procesoRestaurarPg,
  procesoRestaurarRolesPg,
  procesoRolesPg,
  procesoTarDatos,
} from "./comandos";

const script = (p: { args: string[] }) => p.args[p.args.length - 1];

describe("citarSh", () => {
  it("cita con comillas simples y escapa las comillas internas", () => {
    expect(citarSh("o'neil")).toBe(`'o'\\''neil'`);
    expect(citarSh("Mi Base")).toBe("'Mi Base'");
  });
});

describe("Postgres", () => {
  it("lista las bases con psql en la base postgres", () => {
    const p = procesoListarBasesPg("abc");
    expect(p.comando).toBe("docker");
    expect(p.args.slice(0, 4)).toEqual(["exec", "abc", "sh", "-c"]);
    expect(script(p)).toContain(
      `psql -U "\${POSTGRES_USER:-postgres}" -d postgres -Atc "select datname from pg_database where not datistemplate"`,
    );
  });

  it("vuelca una base con --create", () => {
    expect(script(procesoDumpPg("c", "crm"))).toContain(
      `pg_dump -U "\${POSTGRES_USER:-postgres}" -d 'crm' --clean --if-exists --create`,
    );
  });

  it("no usa --create con la base postgres", () => {
    expect(script(procesoDumpPg("c", "postgres"))).not.toContain("--create");
  });

  it("cita nombres con espacios y comillas", () => {
    expect(script(procesoDumpPg("c", "Mi Base"))).toContain("-d 'Mi Base' ");
    expect(script(procesoDumpPg("c", "o'neil"))).toContain(`-d 'o'\\''neil' `);
    expect(script(procesoDumpPg("c", "x; rm -rf /"))).toContain(
      "-d 'x; rm -rf /' ",
    );
  });

  it("vuelca los roles", () => {
    expect(script(procesoRolesPg("c"))).toContain("pg_dumpall");
    expect(script(procesoRolesPg("c"))).toContain("--globals-only");
  });

  it("pasa la base de conexión de pg_dumpall con -l: su -d es una cadena de conexión", () => {
    // Real pg_dumpall 16: `-d postgres` fails with
    // 'missing "=" after "postgres" in connection info string'.
    expect(script(procesoRolesPg("c"))).toContain(" -l postgres ");
    expect(script(procesoRolesPg("c"))).not.toContain("-d postgres");
  });

  it("restaura leyendo stdin", () => {
    const p = procesoRestaurarPg("c");
    expect(p.args.slice(0, 3)).toEqual(["exec", "-i", "c"]);
    expect(script(p)).toContain("-d postgres -v ON_ERROR_STOP=1");
    const r = procesoRestaurarRolesPg("c");
    expect(r.args[1]).toBe("-i");
    expect(script(r)).not.toContain("ON_ERROR_STOP");
  });

  it("espera con pg_isready", () => {
    expect(script(procesoEsperarBd("c", "postgres"))).toContain("pg_isready");
  });
});

describe("MySQL/MariaDB", () => {
  it("vuelca todo sin pasar la contraseña por los argumentos", () => {
    const p = procesoDumpMysql("c");
    expect(p.args).toEqual(["exec", "c", "sh", "-c", expect.any(String)]);
    const s = script(p);
    expect(s).toContain(
      'MYSQL_PWD="${MARIADB_ROOT_PASSWORD:-$MYSQL_ROOT_PASSWORD}"',
    );
    expect(s).toContain("--add-drop-database");
    expect(s).toContain("--single-transaction --routines --events --triggers");
    expect(s).toContain(
      "-e mysql -e sys -e performance_schema -e information_schema",
    );
    expect(s).toContain("command -v mariadb-dump");
    expect(s).toContain("exit 64");
    expect(s).toContain(
      "No se encuentra la contraseña de root en el entorno del contenedor",
    );
    expect(p.env).toBeUndefined();
  });

  it("restaura leyendo stdin", () => {
    const p = procesoRestaurarMysql("c");
    expect(p.args[1]).toBe("-i");
    expect(script(p)).toContain("command -v mariadb ");
    expect(script(p)).toContain("exit 64");
  });

  it("espera con mariadb-admin ping", () => {
    const s = script(procesoEsperarBd("c", "mysql"));
    expect(s).toContain("command -v mariadb-admin");
    expect(s).toContain("ping");
  });
});

describe("datos", () => {
  it("copia en solo lectura", () => {
    expect(procesoTarDatos("aux", "/srv/data").args).toEqual([
      "run",
      "--rm",
      "--name",
      "aux",
      "-v",
      "/srv/data:/datos:ro",
      "busybox:1.37.0",
      "tar",
      "--numeric-owner",
      "-cf",
      "-",
      "-C",
      "/datos",
      ".",
    ]);
  });

  it("extrae vaciando antes, en lectura y escritura", () => {
    const p = procesoExtraerDatos("aux", "crm_media");
    expect(p.args).toContain("-i");
    expect(p.args).toContain("crm_media:/datos");
    expect(script(p)).toBe(
      "find /datos -mindepth 1 -delete && tar --numeric-owner -xf - -C /datos",
    );
  });

  it("rechaza orígenes que añadirían opciones al montaje", () => {
    expect(() => procesoTarDatos("a", "/x:/etc:rw")).toThrow(/no válido/);
    expect(() => procesoExtraerDatos("a", "x:y")).toThrow(/no válido/);
  });
});

describe("nombres y etiquetas", () => {
  it("construye las rutas de stdin", () => {
    expect(nombreStdin({ tipo: "pg_base", servicio: "db", base: "crm" })).toBe(
      "/bd/db/crm.sql",
    );
    expect(nombreStdin({ tipo: "pg_roles", servicio: "db" })).toBe(
      "/bd/db/_roles.sql",
    );
    expect(nombreStdin({ tipo: "mysql", servicio: "db" })).toBe(
      "/bd/db/todo.sql",
    );
  });

  it("deja la base en un solo segmento y sin chocar con _roles", () => {
    const ruta = nombreStdin({
      tipo: "pg_base",
      servicio: "db",
      base: "a/b Mi'Base",
    });
    expect(ruta.split("/")).toHaveLength(4);
    expect(
      nombreStdin({ tipo: "pg_base", servicio: "db", base: "_roles" }),
    ).not.toBe(nombreStdin({ tipo: "pg_roles", servicio: "db" }));
  });

  it("rechaza segmentos vacíos o de puntos", () => {
    expect(() =>
      nombreStdin({ tipo: "pg_base", servicio: "..", base: "x" }),
    ).toThrow();
    expect(() => nombreStdin({ tipo: "mysql", servicio: "" })).toThrow();
  });

  it.each([
    "datos:./data/fotos, 2026",
    "datos:.panel/data",
    "volumen:crm_media",
    "datos:./ñandú/año",
  ])("ida y vuelta de %s", (clave) => {
    const ruta = nombreStdin({ tipo: "datos", clave });
    expect(ruta.split("/")).toHaveLength(3);
    expect(claveDeRuta(ruta)).toBe(clave);
  });

  it("claveDeRuta devuelve bd:<servicio> para las rutas de BD", () => {
    expect(claveDeRuta("/bd/db/x.sql")).toBe("bd:db");
    expect(claveDeRuta("/bd/db/_roles.sql")).toBe("bd:db");
    expect(claveDeRuta(nombreStdin({ tipo: "mysql", servicio: "mi db" }))).toBe(
      "bd:mi db",
    );
  });

  it("claveDeRuta rechaza rutas desconocidas", () => {
    expect(() => claveDeRuta("/otra/cosa")).toThrow(/no reconocida/);
  });

  it("etiquetas con el hash y nunca la clave", () => {
    const clave = "datos:./data/fotos, 2026";
    const e = etiquetasCopia({
      proyectoId: "p1",
      clave,
      backupId: "b1",
      origen: "manual",
    });
    expect(hashClave(clave)).toMatch(/^[0-9a-f]{12}$/);
    expect(e).toEqual([
      "proyecto",
      "p:p1",
      `e:${hashClave(clave)}`,
      "c:b1",
      "o:manual",
    ]);
    expect(e.join("|")).not.toContain("fotos");
  });
});

const GLOBALS = `--
-- PostgreSQL database cluster dump
--

SET default_transaction_read_only = off;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

--
-- Roles
--

CREATE ROLE crm_traza;
ALTER ROLE crm_traza WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:abc==$x:y=';
CREATE ROLE postgres;
ALTER ROLE postgres WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:def==$z:w=';
CREATE ROLE "Postgres";
ALTER ROLE "Postgres" WITH SUPERUSER LOGIN PASSWORD 'SCRAM-SHA-256$4096:ghi';
COMMENT ON ROLE postgres IS 'it''s; the admin';
COMMENT ON ROLE crm_traza IS 'audit';

--
-- User Configurations
--

--
-- User Config "postgres"
--

ALTER ROLE postgres SET search_path TO 'public';
ALTER ROLE postgres IN DATABASE crm SET work_mem TO '8MB';
ALTER ROLE crm_traza IN DATABASE crm SET work_mem TO '4MB';

--
-- Role memberships
--

GRANT pg_monitor TO postgres WITH ADMIN OPTION, INHERIT FALSE, SET TRUE GRANTED BY postgres;
GRANT postgres TO crm_traza GRANTED BY postgres;
GRANT pg_read_all_data TO crm_traza GRANTED BY postgres;

--
-- PostgreSQL database cluster dump complete
--
`;

describe("filtrarRolesSql", () => {
  it("quita todas las sentencias del rol y conserva las demás", () => {
    const r = filtrarRolesSql(GLOBALS, "postgres");
    expect(r).not.toMatch(/^(CREATE|ALTER) ROLE postgres/m);
    expect(r).not.toContain("COMMENT ON ROLE postgres");
    expect(r).not.toContain("SCRAM-SHA-256$4096:def");
    expect(r).not.toContain("ALTER ROLE postgres SET");
    expect(r).not.toContain("IN DATABASE crm SET work_mem TO '8MB'");
    expect(r).not.toContain("GRANT pg_monitor TO postgres");
    expect(r).not.toContain("GRANT postgres TO crm_traza");
    expect(r).toContain("CREATE ROLE crm_traza;");
    expect(r).toContain("ALTER ROLE crm_traza WITH");
    expect(r).toContain("COMMENT ON ROLE crm_traza IS 'audit';");
    expect(r).toContain("ALTER ROLE crm_traza IN DATABASE crm SET");
    expect(r).toContain("GRANT pg_read_all_data TO crm_traza");
    expect(r).toContain('CREATE ROLE "Postgres";');
    expect(r).toContain("SET client_encoding = 'UTF8';");
    expect(r).toContain("-- Role memberships");
  });

  it("también con el rol citado", () => {
    const r = filtrarRolesSql(GLOBALS, '"Postgres"');
    expect(r).not.toContain('"Postgres"');
    expect(r).not.toContain("SCRAM-SHA-256$4096:ghi");
    expect(r).toContain("CREATE ROLE postgres;");
    expect(filtrarRolesSql(GLOBALS, "Postgres")).toBe(r);
  });

  it("no se confunde con ; dentro de un literal", () => {
    expect(filtrarRolesSql(GLOBALS, "postgres")).not.toContain("the admin");
  });

  it("conserva el texto sin sentencia final", () => {
    expect(filtrarRolesSql("SELECT 1", "postgres")).toBe("SELECT 1");
    expect(filtrarRolesSql("SELECT 1; -- fin", "postgres")).toBe(
      "SELECT 1; -- fin",
    );
  });

  it("no toca GRANT de objetos", () => {
    const sql = "GRANT SELECT ON t TO postgres;";
    expect(filtrarRolesSql(sql, "postgres")).toBe(sql);
  });
});
