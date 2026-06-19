import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createServerCaller } from "@/server/caller";
import { GestionUsuarios } from "@/components/dashboard/GestionUsuarios";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const api = await createServerCaller();
  const usuarios = await api.usuarios.listar();

  return (
    <div className="max-w-2xl flex flex-col gap-8">
      <h1 className="font-display text-2xl font-bold text-text-primary">
        Usuarios
      </h1>
      <GestionUsuarios usuariosIniciales={usuarios} />
    </div>
  );
}
