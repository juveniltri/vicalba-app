import { Sidebar } from "@/components/layout/Sidebar";
import { ToastProvider } from "@/components/ui/Toast";

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <div className="grid grid-cols-[240px_1fr] min-h-screen bg-background text-text-primary font-display">
        <Sidebar />
        <main className="min-w-0 overflow-x-hidden overflow-y-auto">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
