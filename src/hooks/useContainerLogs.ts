"use client";

import { useEffect, useRef, useState } from "react";

export type LogLine = { servicio: string; line: string };
type SseEvent = { tipo: "sin_contenedores" | "fin" } | LogLine;

export function useContainerLogs(proyectoId: string | null) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinContenedores, setSinContenedores] = useState(false);
  const [finalizado, setFinalizado] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevProyectoId, setPrevProyectoId] = useState(proyectoId);
  if (proyectoId !== prevProyectoId) {
    setPrevProyectoId(proyectoId);
    setLines([]);
    setError(null);
    setSinContenedores(false);
    setFinalizado(false);
  }

  useEffect(() => {
    if (!proyectoId) return;

    const es = new EventSource(`/api/projects/${proyectoId}/logs`);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event: MessageEvent<string>) => {
      const data = JSON.parse(event.data) as SseEvent;
      if ("tipo" in data) {
        if (data.tipo === "fin") setFinalizado(true);
        else setSinContenedores(true);
        setConnected(false);
        es.close();
        return;
      }
      setLines((prev) => [...prev, data]);
    };

    es.onerror = () => {
      setError("Conexión perdida");
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

  return { lines, connected, error, sinContenedores, finalizado, clear };
}
