"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function DeployPoller({ isDeploying }: { isDeploying: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!isDeploying) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [isDeploying, router]);
  return null;
}
