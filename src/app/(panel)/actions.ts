"use server";

import { signOut } from "@/lib/auth";
import { createServerCaller } from "@/server/caller";

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function iniciarAction(id: string) {
  try {
    const api = await createServerCaller();
    await api.proyectos.iniciar({ id });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al iniciar" };
  }
}

export async function detenerAction(id: string) {
  try {
    const api = await createServerCaller();
    await api.proyectos.detener({ id });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al detener" };
  }
}

export async function restartAction(id: string) {
  try {
    const api = await createServerCaller();
    await api.proyectos.restart({ id });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al reiniciar" };
  }
}

export async function crearClienteAction(slug: string, nombre: string) {
  try {
    const api = await createServerCaller();
    await api.clientes.crear({ slug, nombre });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error al crear cliente",
    };
  }
}

export async function editarClienteAction(id: string, nombre: string) {
  try {
    const api = await createServerCaller();
    await api.clientes.editar({ id, nombre });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error al editar cliente",
    };
  }
}

export async function eliminarClienteAction(id: string) {
  try {
    const api = await createServerCaller();
    await api.clientes.eliminar({ id });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error al eliminar cliente",
    };
  }
}

export async function crearProyectoAction(
  clienteId: string,
  nombre: string,
  dominio: string | undefined,
  servicios: string[],
  repositorioUrl?: string,
  rama?: string,
) {
  try {
    const api = await createServerCaller();
    await api.proyectos.crear({
      clienteId,
      nombre,
      dominio,
      servicios,
      repositorioUrl,
      rama,
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error al crear proyecto",
    };
  }
}

export async function editarProyectoAction(
  id: string,
  nombre: string,
  dominio: string | undefined,
  servicios: string[],
  repositorioUrl?: string,
  rama?: string,
) {
  try {
    const api = await createServerCaller();
    await api.proyectos.editar({
      id,
      nombre,
      dominio,
      servicios,
      repositorioUrl,
      rama,
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error al editar proyecto",
    };
  }
}

export async function deployProyectoAction(id: string) {
  try {
    const api = await createServerCaller();
    await api.proyectos.deploy({ id });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error al hacer deploy",
    };
  }
}

export async function toggleAutoDeployAction(id: string) {
  try {
    const api = await createServerCaller();
    await api.proyectos.toggleAutoDeploy({ id });
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error al cambiar auto-deploy",
    };
  }
}

export async function eliminarProyectoAction(id: string) {
  try {
    const api = await createServerCaller();
    await api.proyectos.eliminar({ id });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error al eliminar proyecto",
    };
  }
}

export async function crearVariableAction(
  proyectoId: string,
  clave: string,
  valor: string,
) {
  try {
    const api = await createServerCaller();
    await api.variables.crear({ proyectoId, clave, valor });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error al crear variable",
    };
  }
}

export async function actualizarVariableAction(id: string, valor: string) {
  try {
    const api = await createServerCaller();
    await api.variables.actualizar({ id, valor });
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error al actualizar variable",
    };
  }
}

export async function eliminarVariableAction(id: string) {
  try {
    const api = await createServerCaller();
    await api.variables.eliminar({ id });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error al eliminar variable",
    };
  }
}

export async function revelarVariableAction(
  id: string,
): Promise<{ valor: string } | { error: string }> {
  try {
    const api = await createServerCaller();
    return await api.variables.revelar({ id });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error al revelar variable",
    };
  }
}
