export interface PayloadNotificacion {
  proyectoNombre: string;
  clienteSlug: string;
  rama: string;
  sha: string | null;
  resultado: "exito" | "error";
  output: string;
}
