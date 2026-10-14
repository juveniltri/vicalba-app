export const HORAS_SIN_COPIA = 26;

export function avisoBackups(
  resumen: {
    habilitado: boolean;
    ultimaCorrecta: Date | null;
    ultimoResultado: string | null;
  },
  ahora: Date,
): string | null {
  if (!resumen.habilitado) return null;
  if (resumen.ultimoResultado === "error")
    return "La última copia de seguridad falló";
  const limite = ahora.getTime() - HORAS_SIN_COPIA * 3600_000;
  if (!resumen.ultimaCorrecta || resumen.ultimaCorrecta.getTime() < limite) {
    return `Ninguna copia de seguridad correcta en las últimas ${HORAS_SIN_COPIA} h`;
  }
  return null;
}
