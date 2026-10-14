import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { leerGuia } from "@/lib/guia";
import { GuiaUsuario } from "@/components/guia/GuiaUsuario";
import { PageHeader } from "@/components/layout/PageHeader";

export const dynamic = "force-dynamic";

export default async function GuiaPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const markdown = await leerGuia();

  return (
    <div className="flex flex-col gap-6 px-5 md:px-10 pt-7 pb-14 print:p-0">
      <div className="print:hidden">
        <PageHeader comando="man vicalba" titulo="Guía" />
      </div>
      {markdown ? (
        <GuiaUsuario markdown={markdown} />
      ) : (
        <p className="font-body text-sm text-text-muted">
          La guía no está disponible en esta instalación.
        </p>
      )}
    </div>
  );
}
