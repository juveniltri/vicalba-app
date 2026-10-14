import type { EjecucionBackup } from "@/lib/schemas/dashboard";

const UNIDADES = ["B", "KB", "MB", "GB"] as const;

export function formatearBytes(n: number): string {
  let valor = n;
  let unidad = 0;
  while (valor >= 1024 && unidad < UNIDADES.length - 1) {
    valor /= 1024;
    unidad++;
  }
  const texto = valor.toLocaleString("es-ES", { maximumFractionDigits: 1 });
  return `${texto} ${UNIDADES[unidad]}`;
}

export function formatearFecha(fecha: Date): string {
  return fecha.toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "short",
    timeStyle: "short",
  });
}

const OPERACION = { copia: "Copia", restauracion: "Restauración" } as const;
const ORIGEN = {
  programado: "Programada",
  manual: "Manual",
  antes_de_restaurar: "Antes de restaurar",
} as const;
const RESULTADO = {
  exito: { texto: "Correcta", clase: "text-state-running" },
  error: { texto: "Error", clase: "text-state-error" },
  en_curso: { texto: "En curso", clase: "text-state-deploying" },
} as const;

export function HistorialBackups({
  historial,
}: {
  historial: EjecucionBackup[];
}) {
  if (historial.length === 0) {
    return (
      <p className="font-body text-xs text-text-muted">
        Aún no hay ninguna ejecución
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full font-body text-[12.5px]">
        <thead>
          <tr className="text-left text-xs text-text-muted">
            <th className="py-1.5 pr-3 font-normal">Fecha</th>
            <th className="py-1.5 pr-3 font-normal">Operación</th>
            <th className="py-1.5 pr-3 font-normal">Origen</th>
            <th className="py-1.5 pr-3 font-normal">Resultado</th>
            <th className="py-1.5 font-normal text-right">Tamaño</th>
          </tr>
        </thead>
        <tbody>
          {historial.map((e) => {
            const resultado = RESULTADO[e.resultado];
            return (
              <tr key={e.id} className="border-t border-border align-top">
                <td className="py-2 pr-3 whitespace-nowrap">
                  {formatearFecha(e.iniciadoEn)}
                </td>
                <td className="py-2 pr-3">{OPERACION[e.operacion]}</td>
                <td className="py-2 pr-3 text-text-secondary">
                  {ORIGEN[e.origen]}
                </td>
                <td className="py-2 pr-3">
                  <span className={resultado.clase}>{resultado.texto}</span>
                  {e.error && (
                    <p className="mt-1 max-w-md break-words text-xs text-text-muted whitespace-pre-line">
                      {e.error}
                    </p>
                  )}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  {e.bytesAnadidos === null
                    ? "—"
                    : formatearBytes(e.bytesAnadidos)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
