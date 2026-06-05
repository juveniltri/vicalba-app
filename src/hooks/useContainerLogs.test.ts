// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useContainerLogs } from "./useContainerLogs";

type MockES = {
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onerror: (() => void) | null;
  close: ReturnType<typeof vi.fn>;
};

let mockEs!: MockES;
const constructedWith: string[] = [];

class FakeEventSource {
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    constructedWith.push(url);
     
    mockEs = this as unknown as MockES;
  }
}

vi.stubGlobal("EventSource", FakeEventSource);

describe("useContainerLogs", () => {
  beforeEach(() => {
    constructedWith.length = 0;
    vi.clearAllMocks();
  });

  it("starts with empty lines and not connected", () => {
    const { result } = renderHook(() => useContainerLogs("p1"));
    expect(result.current.lines).toEqual([]);
    expect(result.current.connected).toBe(false);
  });

  it("opens EventSource to the correct URL", () => {
    renderHook(() => useContainerLogs("p1"));
    expect(constructedWith).toContain("/api/projects/p1/logs");
  });

  it("sets connected to true when EventSource opens", () => {
    const { result } = renderHook(() => useContainerLogs("p1"));
    act(() => {
      mockEs.onopen?.();
    });
    expect(result.current.connected).toBe(true);
  });

  it("appends log lines when messages arrive", () => {
    const { result } = renderHook(() => useContainerLogs("p1"));
    act(() => {
      mockEs.onmessage?.({
        data: JSON.stringify({ servicio: "nginx", line: "started" }),
      });
      mockEs.onmessage?.({
        data: JSON.stringify({ servicio: "nginx", line: "listening" }),
      });
    });
    expect(result.current.lines).toHaveLength(2);
    expect(result.current.lines[0]).toEqual({
      servicio: "nginx",
      line: "started",
    });
    expect(result.current.lines[1]).toEqual({
      servicio: "nginx",
      line: "listening",
    });
  });

  it("sets error and disconnects on EventSource error", () => {
    const { result } = renderHook(() => useContainerLogs("p1"));
    act(() => {
      mockEs.onopen?.();
    });
    act(() => {
      mockEs.onerror?.();
    });
    expect(result.current.error).not.toBeNull();
    expect(result.current.connected).toBe(false);
    expect(mockEs.close).toHaveBeenCalled();
  });

  it("closes EventSource on unmount", () => {
    const { unmount } = renderHook(() => useContainerLogs("p1"));
    unmount();
    expect(mockEs.close).toHaveBeenCalled();
  });

  it("does not open EventSource when proyectoId is null", () => {
    renderHook(() => useContainerLogs(null));
    expect(constructedWith).toHaveLength(0);
  });

  it("clear() empties the lines array", () => {
    const { result } = renderHook(() => useContainerLogs("p1"));
    act(() => {
      mockEs.onmessage?.({
        data: JSON.stringify({ servicio: "nginx", line: "started" }),
      });
    });
    expect(result.current.lines).toHaveLength(1);
    act(() => {
      result.current.clear();
    });
    expect(result.current.lines).toHaveLength(0);
  });
});
