import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
import { auth } from "@/lib/auth";
import { createServerCaller } from "@/server/caller";
import type { EstadoServicio } from "@/lib/schemas/dashboard";
import { MetricasSistema } from "@/components/metricas-sistema";
import { StatsBar } from "@/components/dashboard/StatsBar";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const api = await createServerCaller();
  const clientes = await api.proyectos.listar();
  const proyectos = clientes.flatMap((c) => c.proyectos);

  return (
    <div className="px-10 pt-10 pb-14 max-w-4xl">
      <h1 className="font-display text-2xl font-bold text-text-primary mb-6">
        Dashboard
      </h1>

      {/* Resumen */}
      <div className="mb-8">
        <StatsBar proyectos={proyectos} />
      </div>

      {/* Lista compacta de clientes */}
      <section className="mb-8">
        <h2 className="font-display text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">
          Clientes
        </h2>
        {clientes.length === 0 ? (
          <p className="font-body text-sm text-text-muted">
            Sin clientes.{" "}
            <Link
              href="/proyectos"
              className="text-primary-300 hover:underline"
            >
              Ir a Proyectos
            </Link>{" "}
            para crear el primero.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {clientes.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between px-4 py-3 bg-surface border border-border rounded-[var(--radius-md)]"
              >
                <span className="font-display text-sm font-semibold text-text-primary">
                  {c.nombre}
                </span>
                <div className="flex items-center gap-4">
                  <ResumenEstado proyectos={c.proyectos} />
                  <div className="flex flex-wrap gap-2">
                    {c.proyectos.map((p) => (
                      <Link
                        key={p.id}
                        href={`/proyectos/${p.id}`}
                        className="font-body text-xs text-text-muted hover:text-primary-300 transition-colors duration-[var(--duration-fast)]"
                      >
                        {p.nombre} →
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <MetricasSistema />
    </div>
  );
}

function ResumenEstado({
  proyectos,
}: {
  proyectos: Array<{ estado: EstadoServicio }>;
}) {
  const running = proyectos.filter((p) => p.estado === "running").length;
  const total = proyectos.length;
  return (
    <span className="font-body text-xs text-text-muted">
      <span className="text-state-running">{running}</span>/{total} running
    </span>
  );
}
