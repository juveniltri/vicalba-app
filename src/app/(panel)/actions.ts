"use server";

import { signOut } from "@/lib/auth";
import { createServerCaller } from "@/server/caller";

function parseTRPCError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  try {
    const parsed: unknown = JSON.parse(err.message);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      typeof (parsed[0] as Record<string, unknown>).message === "string"
    ) {
      return (parsed[0] as Record<string, unknown>).message as string;
    }
  } catch {
    // not JSON
  }
  return err.message;
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function iniciarAction(id: string) {
  try {
    const api = await createServerCaller();
    await api.proyectos.iniciar({ id });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al iniciar") };
  }
}

export async function detenerAction(id: string) {
  try {
    const api = await createServerCaller();
    await api.proyectos.detener({ id });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al detener") };
  }
}

export async function restartAction(id: string) {
  try {
    const api = await createServerCaller();
    await api.proyectos.restart({ id });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al reiniciar") };
  }
}

export async function crearClienteAction(slug: string, nombre: string) {
  try {
    const api = await createServerCaller();
    await api.clientes.crear({ slug, nombre });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al crear cliente") };
  }
}

export async function editarClienteAction(id: string, nombre: string) {
  try {
    const api = await createServerCaller();
    await api.clientes.editar({ id, nombre });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al editar cliente") };
  }
}

export async function eliminarClienteAction(id: string) {
  try {
    const api = await createServerCaller();
    await api.clientes.eliminar({ id });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al eliminar cliente") };
  }
}

export async function crearProyectoAction(
  clienteId: string,
  nombre: string,
  dominio: string | undefined,
  repositorioUrl?: string,
  rama?: string,
  tipo?: string,
  puerto?: number,
  imagenUrl?: string,
  dockerfilePath?: string,
  buildCommand?: string,
  startCommand?: string,
) {
  try {
    const api = await createServerCaller();
    await api.proyectos.crear({
      clienteId,
      nombre,
      dominio,
      repositorioUrl,
      rama,
      tipo: tipo as "compose" | "dockerfile" | "image" | "nodejs" | undefined,
      puerto,
      imagenUrl,
      dockerfilePath,
      buildCommand,
      startCommand,
    });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al crear proyecto") };
  }
}

export async function editarProyectoAction(
  id: string,
  nombre: string,
  dominio: string | undefined,
  repositorioUrl?: string,
  rama?: string,
  tipo?: string,
  puerto?: number,
  imagenUrl?: string,
  dockerfilePath?: string,
  buildCommand?: string,
  startCommand?: string,
) {
  try {
    const api = await createServerCaller();
    await api.proyectos.editar({
      id,
      nombre,
      dominio,
      repositorioUrl,
      rama,
      tipo: tipo as "compose" | "dockerfile" | "image" | "nodejs" | undefined,
      puerto,
      imagenUrl,
      dockerfilePath,
      buildCommand,
      startCommand,
    });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al editar proyecto") };
  }
}

export async function deployProyectoAction(id: string) {
  try {
    const api = await createServerCaller();
    await api.proyectos.deploy({ id });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al hacer deploy") };
  }
}

export async function toggleAutoDeployAction(id: string) {
  try {
    const api = await createServerCaller();
    await api.proyectos.toggleAutoDeploy({ id });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al cambiar auto-deploy") };
  }
}

export async function eliminarProyectoAction(id: string) {
  try {
    const api = await createServerCaller();
    await api.proyectos.eliminar({ id });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al eliminar proyecto") };
  }
}

export async function crearVariableAction(
  proyectoId: string,
  clave: string,
  valor: string,
  enBuildTime: boolean = false,
) {
  try {
    const api = await createServerCaller();
    await api.variables.crear({ proyectoId, clave, valor, enBuildTime });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al crear variable") };
  }
}

export async function toggleBuildTimeAction(id: string, enBuildTime: boolean) {
  try {
    const api = await createServerCaller();
    await api.variables.toggleBuildTime({ id, enBuildTime });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al actualizar variable") };
  }
}

export async function importarVariablesAction(
  proyectoId: string,
  contenido: string,
) {
  try {
    const api = await createServerCaller();
    return await api.variables.importar({ proyectoId, contenido });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al importar variables") };
  }
}

export async function actualizarVariableAction(id: string, valor: string) {
  try {
    const api = await createServerCaller();
    await api.variables.actualizar({ id, valor });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al actualizar variable") };
  }
}

export async function eliminarVariableAction(id: string) {
  try {
    const api = await createServerCaller();
    await api.variables.eliminar({ id });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al eliminar variable") };
  }
}

export async function revelarVariableAction(
  id: string,
): Promise<{ valor: string } | { error: string }> {
  try {
    const api = await createServerCaller();
    return await api.variables.revelar({ id });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al revelar variable") };
  }
}

export async function rollbackAction(deployId: string) {
  try {
    const api = await createServerCaller();
    await api.proyectos.rollback({ deployId });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al hacer rollback") };
  }
}

export async function crearCredencialAction(
  nombre: string,
  clavePublica: string,
  clavePrivada: string,
) {
  try {
    const api = await createServerCaller();
    await api.credenciales.crear({ nombre, clavePublica, clavePrivada });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al crear credencial") };
  }
}

export async function eliminarCredencialAction(id: string) {
  try {
    const api = await createServerCaller();
    await api.credenciales.eliminar({ id });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al eliminar credencial") };
  }
}

export async function asignarCredencialAction(
  proyectoId: string,
  credencialId: string | null,
) {
  try {
    const api = await createServerCaller();
    await api.proyectos.asignarCredencial({ id: proyectoId, credencialId });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al asignar credencial") };
  }
}

export async function guardarWebhookAction(
  habilitado: boolean,
  url: string | undefined,
) {
  try {
    const api = await createServerCaller();
    await api.configuracion.guardar({ webhook: { habilitado, url } });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al guardar webhook") };
  }
}

export async function guardarEmailAction(
  habilitado: boolean,
  config?: {
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
    remitente?: string;
    destinatario?: string;
  },
) {
  try {
    const api = await createServerCaller();
    await api.configuracion.guardar({
      email: { habilitado, ...config },
    });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al guardar email") };
  }
}

export async function guardarTelegramAction(
  habilitado: boolean,
  botToken: string | undefined,
  chatId: string | undefined,
) {
  try {
    const api = await createServerCaller();
    await api.configuracion.guardar({
      telegram: { habilitado, botToken, chatId },
    });
  } catch (err) {
    return { error: parseTRPCError(err, "Error al guardar Telegram") };
  }
}
