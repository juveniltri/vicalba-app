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
