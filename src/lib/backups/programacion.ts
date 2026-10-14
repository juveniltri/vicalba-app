export const ZONA = "Europe/Madrid";

function partesMadrid(fecha: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONA,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(fecha)
      .map((x) => [x.type, Number(x.value)]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
  return p;
}

// Madrid wall-clock time `hora:00` of the given Madrid calendar day, in UTC.
function aLasEnMadrid(
  anio: number,
  mes: number,
  dia: number,
  hora: number,
): Date {
  const supuesta = Date.UTC(anio, mes - 1, dia, hora);
  const p = partesMadrid(new Date(supuesta));
  const desfase =
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - supuesta;
  return new Date(supuesta - desfase);
}

export function inicioDelDia(ahora: Date, hora: number): Date {
  const p = partesMadrid(ahora);
  return aLasEnMadrid(p.year, p.month, p.day, hora);
}

export function tocaCopia(
  ahora: Date,
  hora: number,
  ultimoIntento: Date | null,
): boolean {
  const inicio = inicioDelDia(ahora, hora);
  return ahora >= inicio && (!ultimoIntento || ultimoIntento < inicio);
}

export function proximaCopia(
  ahora: Date,
  hora: number,
  ultimoIntento: Date | null,
): Date {
  if (tocaCopia(ahora, hora, ultimoIntento)) return ahora;
  const inicio = inicioDelDia(ahora, hora);
  if (ahora < inicio) return inicio;
  const p = partesMadrid(ahora);
  const manana = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return aLasEnMadrid(
    manana.getUTCFullYear(),
    manana.getUTCMonth() + 1,
    manana.getUTCDate(),
    hora,
  );
}
