// In-memory, per process: enough for the single panel container on the VPS.
export function crearLimitador({
  max,
  ventanaMs,
}: {
  max: number;
  ventanaMs: number;
}) {
  const intentos = new Map<string, { count: number; reset: number }>();

  function limitado(clave: string): boolean {
    const ahora = Date.now();
    for (const [k, v] of intentos) if (ahora >= v.reset) intentos.delete(k);

    const entrada = intentos.get(clave);
    if (!entrada) {
      intentos.set(clave, { count: 1, reset: ahora + ventanaMs });
      return false;
    }
    entrada.count++;
    return entrada.count > max;
  }

  return Object.assign(limitado, { claves: () => intentos.size });
}
