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
) {
  try {
    const api = await createServerCaller();
    await api.proyectos.crear({ clienteId, nombre, dominio, servicios });
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
) {
  try {
    const api = await createServerCaller();
    await api.proyectos.editar({ id, nombre, dominio, servicios });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error al editar proyecto",
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
