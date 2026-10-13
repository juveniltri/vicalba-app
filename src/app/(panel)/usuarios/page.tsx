import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createServerCaller } from "@/server/caller";
import { GestionUsuarios } from "@/components/dashboard/GestionUsuarios";
import { PageHeader } from "@/components/layout/PageHeader";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const api = await createServerCaller();
  const usuarios = await api.usuarios.listar();

  return (
    <div className="flex flex-col gap-6 px-5 md:px-10 pt-7 pb-14">
      <PageHeader comando="who" titulo="Usuarios" />
      <section className="max-w-3xl rounded-[var(--radius-lg)] bg-surface border border-border p-5">
        <GestionUsuarios usuariosIniciales={usuarios} />
      </section>
    </div>
  );
}
