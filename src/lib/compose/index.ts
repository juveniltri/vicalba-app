import { parse, stringify } from "yaml";

export function extraerServicios(content: string): string[] {
  if (!content.trim()) return [];
  try {
    const doc = parse(content) as Record<string, unknown>;
    const services = doc?.services;
    if (!services || typeof services !== "object") return [];
    return Object.keys(services);
  } catch {
    return [];
  }
}

function puertoContenedorDe(entrada: unknown): number | undefined {
  // formatos válidos en expose/ports: 8000, "8000", "8000/tcp", "8000:8000",
  // "127.0.0.1:8000:8000" — el puerto de contenedor es siempre el último tramo.
  const ultimoTramo = String(entrada).split(":").at(-1) ?? "";
  const puerto = Number(ultimoTramo.split("/")[0]);
  return Number.isFinite(puerto) ? puerto : undefined;
}

// Varios servicios de un mismo compose pueden compartir imagen (p. ej. web/worker/beat
// construidos del mismo Dockerfile con EXPOSE 8000) — el puerto expuesto por Docker no
// basta para distinguir cuál sirve HTTP realmente. El nombre de servicio que declara ese
// puerto en el propio YAML sí lo identifica, vía la label com.docker.compose.service.
export function encontrarServicioPorPuerto(
  content: string,
  puerto: number,
): string | undefined {
  if (!content.trim()) return undefined;
  try {
    const doc = parse(content) as Record<string, unknown>;
    const services = doc?.services;
    if (!services || typeof services !== "object") return undefined;
    for (const [nombre, definicion] of Object.entries(
      services as Record<string, unknown>,
    )) {
      const { expose, ports } = (definicion ?? {}) as {
        expose?: unknown[];
        ports?: unknown[];
      };
      const declarados = [...(expose ?? []), ...(ports ?? [])];
      if (declarados.some((d) => puertoContenedorDe(d) === puerto))
        return nombre;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

// Docker keeps container logs forever by default; a chatty container fills
// the VPS disk. 3 × 10 MB per container is plenty for the logs viewer.
export const LIMITE_LOGS = {
  driver: "json-file",
  options: { "max-size": "10m", "max-file": "3" },
} as const;

export function generarOverrideLogging(content: string): string | null {
  let services: unknown;
  try {
    services = (parse(content) as { services?: unknown } | null)?.services;
  } catch {
    // An invalid compose fails in `docker compose` with its own error.
    return null;
  }
  if (!services || typeof services !== "object") return null;
  const sinLimite = Object.entries(
    services as Record<string, { logging?: unknown } | null>,
  ).filter(([, definicion]) => !definicion?.logging);
  if (!sinLimite.length) return null;
  const override = Object.fromEntries(
    sinLimite.map(([nombre]) => [nombre, { logging: LIMITE_LOGS }]),
  );
  return stringify({ services: override }, { aliasDuplicateObjects: false });
}
