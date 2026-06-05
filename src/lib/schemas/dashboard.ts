import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";

type RouterOutput = inferRouterOutputs<AppRouter>;

export type ClienteConProyectos = RouterOutput["proyectos"]["listar"][number];
export type ProyectoResumen = ClienteConProyectos["proyectos"][number];
export type ServicioResumen = ProyectoResumen["servicios"][number];
export type EstadoServicio = ProyectoResumen["estado"];
