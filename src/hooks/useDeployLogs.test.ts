// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDeployLogs } from "./useDeployLogs";

type MockES = {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onerror: (() => void) | null;
  close: ReturnType<typeof vi.fn>;
};

let mockEs!: MockES;
const constructedWith: string[] = [];

class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readyState = FakeEventSource.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn(() => {
    this.readyState = FakeEventSource.CLOSED;
  });

  constructor(url: string) {
    constructedWith.push(url);
    mockEs = this as unknown as MockES;
  }
}

vi.stubGlobal("EventSource", FakeEventSource);

describe("useDeployLogs", () => {
  beforeEach(() => {
    constructedWith.length = 0;
    vi.clearAllMocks();
  });

  it("starts with empty lines and done null", () => {
    const { result } = renderHook(() => useDeployLogs("p1", true));
    expect(result.current.lines).toEqual([]);
    expect(result.current.done).toBeNull();
  });

  it("does not open EventSource when inactive", () => {
    renderHook(() => useDeployLogs("p1", false));
    expect(constructedWith).toHaveLength(0);
  });

  it("does not open EventSource when proyectoId is null", () => {
    renderHook(() => useDeployLogs(null, true));
    expect(constructedWith).toHaveLength(0);
  });

  it("opens EventSource to the deploy-logs URL when active", () => {
    renderHook(() => useDeployLogs("p1", true));
    expect(constructedWith).toContain("/api/projects/p1/deploy-logs");
  });

  it("appends lines as line messages arrive", () => {
    const { result } = renderHook(() => useDeployLogs("p1", true));
    act(() => {
      mockEs.onmessage?.({ data: JSON.stringify({ line: "clonando…" }) });
      mockEs.onmessage?.({ data: JSON.stringify({ line: "construyendo…" }) });
    });
    expect(result.current.lines).toEqual(["clonando…", "construyendo…"]);
  });

  it("sets done and closes on done message", () => {
    const { result } = renderHook(() => useDeployLogs("p1", true));
    act(() => {
      mockEs.onmessage?.({
        data: JSON.stringify({ tipo: "done", resultado: "exito" }),
      });
    });
    expect(result.current.done).toBe("exito");
    expect(mockEs.close).toHaveBeenCalled();
  });

  it("closes without setting done on sin_deploy message", () => {
    const { result } = renderHook(() => useDeployLogs("p1", true));
    act(() => {
      mockEs.onmessage?.({ data: JSON.stringify({ tipo: "sin_deploy" }) });
    });
    expect(result.current.done).toBeNull();
    expect(mockEs.close).toHaveBeenCalled();
  });

  it("resets lines on reconnect (onopen) para no duplicar el backlog reenviado", () => {
    const { result } = renderHook(() => useDeployLogs("p1", true));
    act(() => {
      mockEs.onmessage?.({ data: JSON.stringify({ line: "primera línea" }) });
    });
    expect(result.current.lines).toEqual(["primera línea"]);

    act(() => {
      mockEs.onopen?.();
    });
    expect(result.current.lines).toEqual([]);
  });

  it("no cierra la conexión en un error transitorio (deja que EventSource reintente)", () => {
    renderHook(() => useDeployLogs("p1", true));
    mockEs.readyState = FakeEventSource.CONNECTING;
    act(() => {
      mockEs.onerror?.();
    });
    expect(mockEs.close).not.toHaveBeenCalled();
  });

  it("cierra explícitamente cuando el error deja la conexión en CLOSED", () => {
    renderHook(() => useDeployLogs("p1", true));
    mockEs.readyState = FakeEventSource.CLOSED;
    act(() => {
      mockEs.onerror?.();
    });
    expect(mockEs.close).toHaveBeenCalled();
  });

  it("closes EventSource on unmount", () => {
    const { unmount } = renderHook(() => useDeployLogs("p1", true));
    unmount();
    expect(mockEs.close).toHaveBeenCalled();
  });
});
