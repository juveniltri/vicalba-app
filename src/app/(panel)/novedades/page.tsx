import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { leerChangelog } from "@/lib/changelog";
import { VersionNovedades } from "@/components/dashboard/Novedades";
import { PageHeader } from "@/components/layout/PageHeader";

export const dynamic = "force-dynamic";

export default async function NovedadesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const versiones = await leerChangelog();

  return (
    <div className="flex flex-col gap-6 px-5 md:px-10 pt-7 pb-14">
      <PageHeader comando="cat CHANGELOG.md" titulo="Novedades" />
      <div className="flex max-w-3xl flex-col gap-4">
        {versiones.length === 0 ? (
          <p className="font-body text-sm text-text-muted">
            Todavía no hay historial de versiones.
          </p>
        ) : (
          versiones.map((v) => <VersionNovedades key={v.version} version={v} />)
        )}
      </div>
    </div>
  );
}
