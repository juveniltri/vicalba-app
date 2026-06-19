export function AbrirUrlBoton({
  dominio,
  sslActivo,
}: {
  dominio: string | null;
  sslActivo: boolean | null;
}) {
  if (!dominio) return null;
  const href = sslActivo ? `https://${dominio}` : `http://${dominio}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir en el navegador"
      className="text-text-muted hover:text-text-primary transition-colors duration-[var(--duration-fast)]"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </a>
  );
}
