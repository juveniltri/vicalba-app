import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/env", () => ({ env: { REPOS_DIR: "/repos" } }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { volumen: { findUnique: vi.fn() } },
}));
vi.mock("node:fs/promises", () => ({ mkdir: vi.fn() }));
vi.mock("@/lib/volumenes", () => ({
  rutaHostVolumen: vi
    .fn()
    .mockReturnValue("/repos/cliente/proyecto/volumes/galeria"),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mkdir } from "node:fs/promises";
import { POST } from "./route";

const mockSession = {
  user: { id: "u1", email: "admin@vicalba.local" },
  expires: "2099-01-01",
};

const mockVolumen = {
  id: "v1",
  nombre: "galeria",
  proyecto: { nombre: "web-app", cliente: { slug: "cliente-uno" } },
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/volumes/v1/files/mkdir", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/volumes/[id]/files/mkdir", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devuelve 401 sin sesión", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await POST(makeRequest({ path: "", nombre: "nueva" }), {
      params: Promise.resolve({ id: "v1" }),
    });
    expect(res.status).toBe(401);
  });

  it("devuelve 404 si el volumen no existe", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.volumen.findUnique).mockResolvedValue(null);
    const res = await POST(makeRequest({ path: "", nombre: "nueva" }), {
      params: Promise.resolve({ id: "v1" }),
    });
    expect(res.status).toBe(404);
  });

  it("devuelve 400 si el body es inválido", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.volumen.findUnique).mockResolvedValue(
      mockVolumen as never,
    );
    const res = await POST(makeRequest({ nombre: "" }), {
      params: Promise.resolve({ id: "v1" }),
    });
    expect(res.status).toBe(400);
  });

  it("devuelve 400 si el path resultante es inválido (traversal)", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.volumen.findUnique).mockResolvedValue(
      mockVolumen as never,
    );
    const res = await POST(makeRequest({ path: "../../etc", nombre: "evil" }), {
      params: Promise.resolve({ id: "v1" }),
    });
    expect(res.status).toBe(400);
  });

  it("crea la carpeta y devuelve 201", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.volumen.findUnique).mockResolvedValue(
      mockVolumen as never,
    );
    vi.mocked(mkdir).mockResolvedValue(undefined);

    const res = await POST(makeRequest({ path: "fotos", nombre: "2024" }), {
      params: Promise.resolve({ id: "v1" }),
    });

    expect(res.status).toBe(201);
    expect(mkdir).toHaveBeenCalledWith(expect.stringContaining("fotos/2024"), {
      recursive: false,
    });
  });

  it("devuelve 409 si la carpeta ya existe", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.volumen.findUnique).mockResolvedValue(
      mockVolumen as never,
    );
    const err = Object.assign(new Error("EEXIST"), { code: "EEXIST" });
    vi.mocked(mkdir).mockRejectedValue(err);

    const res = await POST(makeRequest({ path: "", nombre: "existente" }), {
      params: Promise.resolve({ id: "v1" }),
    });
    expect(res.status).toBe(409);
  });
});
