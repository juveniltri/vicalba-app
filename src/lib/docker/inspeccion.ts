import { z } from "zod";
import { docker } from "./client";

export type Montaje = {
  tipo: "bind" | "volume" | "otro";
  origen: string;
  destino: string;
  rw: boolean;
  nombre: string | null;
};

export type ContenedorInspeccionado = {
  id: string;
  servicio: string;
  imagen: string;
  enMarcha: boolean;
  env: Record<string, string>;
  montajes: Montaje[];
};

const inspeccionSchema = z.object({
  Id: z.string(),
  Name: z.string().default(""),
  Config: z.object({
    Image: z.string().default(""),
    Env: z.array(z.string()).nullish(),
    Labels: z.record(z.string(), z.string()).nullish(),
  }),
  State: z.object({ Running: z.boolean().default(false) }),
  Mounts: z
    .array(
      z.object({
        Type: z.string().default(""),
        Name: z.string().nullish(),
        Source: z.string().default(""),
        Destination: z.string().default(""),
        RW: z.boolean().default(false),
      }),
    )
    .nullish(),
});

const volumenSchema = z.object({
  Driver: z.string().default(""),
  Labels: z.record(z.string(), z.string()).nullish(),
  Options: z.record(z.string(), z.string()).nullish(),
});

export type VolumenInspeccionado = {
  etiquetas: Record<string, string>;
  driver: string;
  opciones: Record<string, string>;
};

function aEnv(lineas: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const linea of lineas) {
    const i = linea.indexOf("=");
    if (i > 0) env[linea.slice(0, i)] = linea.slice(i + 1);
  }
  return env;
}

function aTipo(tipo: string): Montaje["tipo"] {
  return tipo === "bind" || tipo === "volume" ? tipo : "otro";
}

export async function inspeccionarProyecto(
  clienteSlug: string,
  proyectoNombre: string,
): Promise<ContenedorInspeccionado[]> {
  const lista = await docker.listContainers({
    all: true,
    filters: {
      label: [`com.docker.compose.project=${clienteSlug}-${proyectoNombre}`],
    },
  });
  return Promise.all(
    lista.map(async ({ Id }) => {
      const datos = inspeccionSchema.parse(
        await docker.getContainer(Id).inspect(),
      );
      return {
        id: datos.Id,
        servicio:
          datos.Config.Labels?.["com.docker.compose.service"] ??
          datos.Name.replace(/^\//, ""),
        imagen: datos.Config.Image,
        enMarcha: datos.State.Running,
        env: aEnv(datos.Config.Env ?? []),
        montajes: (datos.Mounts ?? []).map((m) => ({
          tipo: aTipo(m.Type),
          origen: m.Source,
          destino: m.Destination,
          rw: m.RW,
          nombre: m.Name ?? null,
        })),
      };
    }),
  );
}

export async function inspeccionarVolumen(
  nombre: string,
): Promise<VolumenInspeccionado | null> {
  try {
    const datos = volumenSchema.parse(await docker.getVolume(nombre).inspect());
    return {
      etiquetas: datos.Labels ?? {},
      driver: datos.Driver,
      opciones: datos.Options ?? {},
    };
  } catch (err) {
    // A volume removed between the container inspect and this call is then
    // reported as external instead of failing the whole detection.
    if ((err as { statusCode?: number }).statusCode === 404) return null;
    throw err;
  }
}
