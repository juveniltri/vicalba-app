import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";

type RouterOutput = inferRouterOutputs<AppRouter>;

export type ClienteConProyectos = RouterOutput["proyectos"]["listar"][number];
export type ProyectoResumen = ClienteConProyectos["proyectos"][number];
export type EstadoServicio = ProyectoResumen["estado"];
export type ActividadDashboard = RouterOutput["proyectos"]["actividad"];
export type ProyectoAtencion = ActividadDashboard["atencion"][number];
export type DeployReciente = ActividadDashboard["recientes"][number];
export type ProyectoIndice = RouterOutput["proyectos"]["indice"][number];
export type ConfiguracionBackupVista =
  RouterOutput["backups"]["obtenerConfiguracion"];
export type EjecucionBackup = RouterOutput["backups"]["historial"][number];
export type CopiaBackup = RouterOutput["backups"]["copias"][number];
export type BackupsProyectoVista = RouterOutput["backups"]["elementosProyecto"];
export type CopiaProyecto = RouterOutput["backups"]["copiasProyecto"][number];
