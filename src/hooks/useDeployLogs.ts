"use client";

import { useEffect, useRef, useState } from "react";

type SseEvent =
  | { line: string }
  | { tipo: "done"; resultado: "exito" | "error" }
  | { tipo: "sin_deploy" };

export function useDeployLogs(proyectoId: string | null, active: boolean) {
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState<"exito" | "error" | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!proyectoId || !active) return;

    const es = new EventSource(`/api/projects/${proyectoId}/deploy-logs`);
    esRef.current = es;

    es.onmessage = (event: MessageEvent<string>) => {
      const data = JSON.parse(event.data) as SseEvent;
      if ("line" in data) {
        setLines((prev) => [...prev, data.line]);
      } else if (data.tipo === "done") {
        setDone(data.resultado);
        es.close();
      } else {
        // sin_deploy: nothing to stream
        es.close();
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
      setLines([]);
      setDone(null);
    };
  }, [proyectoId, active]);

  return { lines, done };
}
