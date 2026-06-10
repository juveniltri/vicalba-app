"use client";

import { useEffect, useRef, useState } from "react";

export type LogLine = { servicio: string; line: string };
type SseEvent = { tipo: "sin_contenedores" } | LogLine;

export function useContainerLogs(proyectoId: string | null) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinContenedores, setSinContenedores] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!proyectoId) return;

    const es = new EventSource(`/api/projects/${proyectoId}/logs`);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event: MessageEvent<string>) => {
      const data = JSON.parse(event.data) as SseEvent;
      if ("tipo" in data) {
        setSinContenedores(true);
        setConnected(false);
        es.close();
        return;
      }
      setLines((prev) => [...prev, data]);
    };

    es.onerror = () => {
      setError("Connection lost");
      setConnected(false);
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [proyectoId]);

  const clear = () => setLines([]);

  return { lines, connected, error, sinContenedores, clear };
}
