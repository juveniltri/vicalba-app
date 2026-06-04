import "@testing-library/jest-dom";
import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.clearAllMocks();
});

// Mock global del módulo de Docker para tests unitarios.
// Los tests de src/lib/docker/ usan vi.mock('dockerode') individualmente.
// Los tests de src/lib/traefik/ no necesitan Docker — son transformaciones puras.
