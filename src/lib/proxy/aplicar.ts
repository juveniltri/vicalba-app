import type { ConfiguracionProxy } from "@/lib/schemas/proxy";
import { generarTlsDinamico, generarTraefikEstatico } from "./estatico";

// Everything that touches the disk or Docker, injected so each failure can be
// rehearsed without restarting a real Traefik.
export type DepsAplicar = {
  leerEstatico(): Promise<string | null>;
  escribirEstatico(contenido: string): Promise<void>;
  guardarPrevio(contenido: string): Promise<void>;
  escribirTls(contenido: string): Promise<void>;
  reiniciarTraefik(): Promise<void>;
  traefikResponde(): Promise<boolean>;
  ultimasLineasLog(): Promise<string>;
  esperar(ms: number): Promise<void>;
};

export type ResultadoAplicar =
  | { resultado: "aplicada" }
  | { resultado: "revertida" | "error"; mensaje: string; log: string };

// The Panel itself is routed through Traefik: a static file that doesn't start
// must never stay in place, so every failure goes back to the previous one.
export async function aplicarConfiguracionProxy(
  config: ConfiguracionProxy,
  opciones: { acmeStorage: string; acmeEmail?: string },
  deps: DepsAplicar,
  espera: { intentos: number; intervaloMs?: number } = { intentos: 20 },
): Promise<ResultadoAplicar> {
  const intervaloMs = espera.intervaloMs ?? 1000;

  async function arranca(): Promise<boolean> {
    try {
      await deps.reiniciarTraefik();
    } catch {
      return false;
    }
    for (let i = 0; i < espera.intentos; i++) {
      if (await deps.traefikResponde().catch(() => false)) return true;
      await deps.esperar(intervaloMs);
    }
    return false;
  }

  const log = () =>
    deps.ultimasLineasLog().catch(() => "(no se pudo leer el log de Traefik)");

  const anterior = await deps.leerEstatico();
  const nuevo = generarTraefikEstatico(config, opciones);

  if (nuevo !== anterior) {
    if (anterior !== null) await deps.guardarPrevio(anterior);
    await deps.escribirEstatico(nuevo);
    if (!(await arranca())) {
      if (anterior === null)
        return {
          resultado: "error",
          mensaje:
            "Traefik no arranca con esta configuración y no hay una anterior a la que volver.",
          log: await log(),
        };
      const motivo = await log();
      await deps.escribirEstatico(anterior);
      if (await arranca())
        return {
          resultado: "revertida",
          mensaje:
            "Traefik no arrancó con la nueva configuración; se ha vuelto a la anterior.",
          log: motivo,
        };
      return {
        resultado: "error",
        mensaje:
          "Traefik no arranca ni con la configuración anterior. Entra al Panel por un túnel SSH a 127.0.0.1:3000 y sigue docs/recuperacion.md.",
        log: motivo,
      };
    }
  }

  await deps.escribirTls(generarTlsDinamico(config));
  return { resultado: "aplicada" };
}
