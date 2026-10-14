import { Sidebar } from "@/components/layout/Sidebar";
import { ToastProvider } from "@/components/ui/Toast";
import { auth } from "@/lib/auth";
import { createServerCaller } from "@/server/caller";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const proyectos = session
    ? await (await createServerCaller()).proyectos.indice()
    : [];

  return (
    <ToastProvider>
      <div className="flex flex-col md:grid md:grid-cols-[232px_minmax(0,1fr)] print:block min-h-screen bg-background text-text-primary font-body">
        <Sidebar
          proyectos={proyectos}
          usuario={{
            nombre: session?.user?.name ?? null,
            email: session?.user?.email ?? null,
          }}
        />
        <main className="min-w-0 overflow-x-hidden md:overflow-y-auto md:h-screen print:h-auto print:overflow-visible">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
