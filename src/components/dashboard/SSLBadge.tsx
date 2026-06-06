export function SSLBadge({ estado }: { estado: { activo: boolean } }) {
  if (estado.activo) {
    return (
      <span className="font-body text-xs text-state-running">● SSL activo</span>
    );
  }
  return (
    <span className="font-body text-xs text-state-deploying">
      ○ SSL pendiente
    </span>
  );
}
