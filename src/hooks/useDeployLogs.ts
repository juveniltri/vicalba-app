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

  // Reset del estado al cambiar de proyecto (no al terminar un deploy):
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevProyectoId, setPrevProyectoId] = useState(proyectoId);
  if (proyectoId !== prevProyectoId) {
    setPrevProyectoId(proyectoId);
    setLines([]);
    setDone(null);
  }

  useEffect(() => {
    if (!proyectoId || !active) return;

    const es = new EventSource(`/api/projects/${proyectoId}/deploy-logs`);
    esRef.current = es;

    es.onopen = () => {
      // El servidor reenvía todo el backlog en cada (re)conexión, así que
      // arrancamos de cero para no duplicar líneas ya mostradas.
      setLines([]);
      setDone(null);
    };

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
      // En errores transitorios, EventSource reintenta la conexión de forma
      // nativa; solo cerramos si el navegador ya ha dado la conexión por muerta.
      if (es.readyState === EventSource.CLOSED) {
        es.close();
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [proyectoId, active]);

  return { lines, done };
}
