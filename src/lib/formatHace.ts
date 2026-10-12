export function formatHace(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

export function shaCorto(sha: string | null | undefined): string | null {
  return sha ? sha.slice(0, 7) : null;
}

export function diasHasta(fecha: string | Date, ahora = new Date()): number {
  return Math.floor((new Date(fecha).getTime() - ahora.getTime()) / 86_400_000);
}
