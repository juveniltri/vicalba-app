// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { DeployPoller } from "./DeployPoller";

describe("DeployPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("llama a router.refresh cada 3 segundos cuando isDeploying es true", () => {
    render(<DeployPoller isDeploying={true} />);
    vi.advanceTimersByTime(9000);
    expect(mockRefresh).toHaveBeenCalledTimes(3);
  });

  it("no llama a router.refresh cuando isDeploying es false", () => {
    render(<DeployPoller isDeploying={false} />);
    vi.advanceTimersByTime(9000);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("limpia el intervalo al desmontar", () => {
    const { unmount } = render(<DeployPoller isDeploying={true} />);
    vi.advanceTimersByTime(3000);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    unmount();
    vi.advanceTimersByTime(6000);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("sigue refrescando tras terminar el deploy si sslPendiente sigue true", () => {
    const { rerender } = render(
      <DeployPoller isDeploying={true} sslPendiente={true} />,
    );
    vi.advanceTimersByTime(3000);
    expect(mockRefresh).toHaveBeenCalledTimes(1);

    rerender(<DeployPoller isDeploying={false} sslPendiente={true} />);
    vi.advanceTimersByTime(6000);
    expect(mockRefresh).toHaveBeenCalledTimes(3);
  });

  it("deja de refrescar en cuanto sslPendiente pasa a false", () => {
    const { rerender } = render(
      <DeployPoller isDeploying={true} sslPendiente={true} />,
    );
    rerender(<DeployPoller isDeploying={false} sslPendiente={true} />);
    vi.advanceTimersByTime(3000);
    expect(mockRefresh).toHaveBeenCalledTimes(1);

    rerender(<DeployPoller isDeploying={false} sslPendiente={false} />);
    vi.advanceTimersByTime(6000);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("deja de refrescar al agotar la ventana de gracia aunque sslPendiente siga true", () => {
    const { rerender } = render(
      <DeployPoller isDeploying={true} sslPendiente={true} />,
    );
    rerender(<DeployPoller isDeploying={false} sslPendiente={true} />);
    vi.advanceTimersByTime(60_000);
    const callsAtWindowEnd = mockRefresh.mock.calls.length;
    vi.advanceTimersByTime(6000);
    expect(mockRefresh).toHaveBeenCalledTimes(callsAtWindowEnd);
  });

  it("si nunca estuvo deploying, sslPendiente=true no genera polling", () => {
    render(<DeployPoller isDeploying={false} sslPendiente={true} />);
    vi.advanceTimersByTime(9000);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
