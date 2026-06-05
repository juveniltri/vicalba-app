import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="font-display text-2xl font-bold text-text-primary">
        Página no encontrada
      </h1>
      <p className="font-body text-sm text-text-muted">
        Esta sección aún no existe.
      </p>
      <Link
        href="/"
        className="font-body text-sm text-primary-400 hover:text-primary-300 transition-colors"
      >
        ← Volver al dashboard
      </Link>
    </div>
  );
}
