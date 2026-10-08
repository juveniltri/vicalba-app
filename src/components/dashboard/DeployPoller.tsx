"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 3000;
export const SSL_GRACE_MS = 60_000;

export function DeployPoller({
  isDeploying,
  sslPendiente = false,
}: {
  isDeploying: boolean;
  sslPendiente?: boolean;
}) {
  const router = useRouter();
  const wasDeployingRef = useRef(isDeploying);
  const sslGraceUntilRef = useRef<number | null>(null);

  useEffect(() => {
    if (wasDeployingRef.current && !isDeploying && sslPendiente) {
      sslGraceUntilRef.current = Date.now() + SSL_GRACE_MS;
    }
    if (!sslPendiente) {
      sslGraceUntilRef.current = null;
    }
    wasDeployingRef.current = isDeploying;
  }, [isDeploying, sslPendiente]);

  useEffect(() => {
    const inGraceNow = () =>
      sslGraceUntilRef.current !== null &&
      Date.now() < sslGraceUntilRef.current;

    if (!isDeploying && !inGraceNow()) return;

    const timer = setInterval(() => {
      if (!isDeploying && !inGraceNow()) {
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isDeploying, sslPendiente, router]);

  return null;
}
