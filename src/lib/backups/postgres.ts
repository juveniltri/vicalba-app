import { ejecutar } from "./procesos";

// libpq reads the connection from PG* variables, so the password never shows
// up in the process list.
export function entornoPg(databaseUrl: string): Record<string, string> {
  const url = new URL(databaseUrl);
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.replace(/^\//, ""),
  };
}

export async function pgDump(
  databaseUrl: string,
  fichero: string,
  signal?: AbortSignal,
): Promise<void> {
  await ejecutar("pg_dump", ["--format=custom", "--file", fichero], {
    env: entornoPg(databaseUrl),
    signal,
  });
}

export async function pgRestore(
  databaseUrl: string,
  fichero: string,
  signal?: AbortSignal,
): Promise<void> {
  const env = entornoPg(databaseUrl);
  await ejecutar(
    "pg_restore",
    [
      "--clean",
      "--if-exists",
      "--single-transaction",
      "--no-owner",
      "--dbname",
      env.PGDATABASE!,
      fichero,
    ],
    { env, signal },
  );
}
