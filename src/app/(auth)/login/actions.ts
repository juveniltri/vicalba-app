"use server";

import { DemasiadosIntentos, signIn } from "@/lib/auth";
import { AuthError } from "next-auth";

export async function loginAction(email: string, password: string) {
  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof DemasiadosIntentos) {
      return { error: "Demasiados intentos. Espera un minuto." };
    }
    if (error instanceof AuthError) {
      return { error: "Credenciales incorrectas" };
    }
    throw error;
  }
}
