import { Sidebar } from "@/components/layout/Sidebar";

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6 bg-background">{children}</main>
    </div>
  );
}
