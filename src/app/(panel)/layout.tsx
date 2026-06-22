import { Sidebar } from "@/components/layout/Sidebar";

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[240px_1fr] min-h-screen bg-background text-text-primary font-display">
      <Sidebar />
      <main className="min-w-0 overflow-x-hidden overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
