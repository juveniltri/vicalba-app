import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createServerCaller } from "@/server/caller";
import type { EstadoServicio } from "@/lib/schemas/dashboard";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const api = await createServerCaller();
  const clientes = await api.proyectos.listar();
  const proyectos = clientes.flatMap((c) => c.proyectos);

  const stats = {
    clientes: clientes.length,
    proyectos: proyectos.length,
    running: proyectos.filter((p) => p.estado === "running").length,
    error: proyectos.filter((p) => p.estado === "error").length,
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-text-primary mb-6">
        Dashboard
      </h1>

      {/* Resumen */}
      <div className="flex flex-wrap gap-3 mb-8">
        <StatPill count={stats.clientes} label="clientes" />
        <StatPill count={stats.proyectos} label="proyectos" />
        <StatPill
          count={stats.running}
          label="running"
          color="text-state-running"
        />
        <StatPill count={stats.error} label="error" color="text-state-error" />
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
                  <Link
                    href="/proyectos"
                    className="font-body text-xs text-text-muted hover:text-primary-300 transition-colors duration-[var(--duration-fast)]"
                  >
                    Ver proyectos →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Placeholder métricas */}
      <section>
        <h2 className="font-display text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">
          Métricas de sistema
        </h2>
        <div className="border border-dashed border-border rounded-[var(--radius-md)] p-8 text-center">
          <p className="font-body text-xs text-text-muted">
            CPU · RAM · Disco — próximamente
          </p>
        </div>
      </section>
    </div>
  );
}

function StatPill({
  count,
  label,
  color = "text-text-muted",
}: {
  count: number;
  label: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-surface border border-border rounded-[var(--radius-md)] px-4 py-2">
      <span className={`font-display text-xl font-bold ${color}`}>{count}</span>
      <span className="font-body text-xs text-text-muted">{label}</span>
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
