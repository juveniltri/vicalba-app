export const MENSAJE_RESTAURANDO =
  "El Proyecto se está restaurando: espera a que termine";

export class ProyectoRestaurando extends Error {
  constructor() {
    super(MENSAJE_RESTAURANDO);
    this.name = "ProyectoRestaurando";
  }
}

// NOTE: shared through globalThis because the restore runs from one route
// bundle (tRPC) while deploys and the webhook check it from others.
const globalForRestaurando = globalThis as unknown as {
  proyectosRestaurando?: Set<string>;
};
const restaurando = (globalForRestaurando.proyectosRestaurando ??=
  new Set<string>());

export function marcarRestaurando(id: string): void {
  if (restaurando.has(id)) throw new ProyectoRestaurando();
  restaurando.add(id);
}

export function desmarcarRestaurando(id: string): void {
  restaurando.delete(id);
}

export function estaRestaurando(id: string): boolean {
  return restaurando.has(id);
}
