"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SidebarLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`flex items-center px-3 py-2 rounded-[var(--radius-sm)] font-body text-sm transition-colors duration-[var(--duration-fast)] ${
        isActive
          ? "bg-primary-500/10 text-primary-300 border-l-2 border-primary-500 pl-[calc(0.75rem-2px)]"
          : "text-text-muted hover:text-text-primary hover:bg-surface"
      }`}
    >
      {children}
    </Link>
  );
}
