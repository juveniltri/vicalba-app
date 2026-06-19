import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/env", () => ({ env: { REPOS_DIR: "/repos" } }));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    volumen: { findUnique: vi.fn() },
  },
}));

vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));

vi.mock("fflate", () => ({
  zip: vi.fn((_files, cb) =>
    cb(
      null,
      new Uint8Array([
        80, 75, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ]),
    ),
  ),
}));

vi.mock("@/lib/volumenes", () => ({
  rutaHostVolumen: vi
    .fn()
    .mockReturnValue("/repos/cliente/proyecto/volumes/galeria"),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readFile } from "node:fs/promises";
import { GET } from "./route";

const mockSession = {
  user: { id: "u1", email: "admin@vicalba.local" },
  expires: "2099-01-01",
};

const mockVolumen = {
  id: "v1",
  nombre: "galeria",
  proyecto: {
    nombre: "web-app",
    cliente: { slug: "cliente-uno" },
  },
};

function makeRequest(searchParams: Record<string, string>) {
  const url = new URL("http://localhost/api/volumes/v1/files/download");
  for (const [k, v] of Object.entries(searchParams)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

describe("GET /api/volumes/[id]/files/download", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devuelve 401 sin sesión", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await GET(makeRequest({ files: "foto.jpg" }), {
      params: Promise.resolve({ id: "v1" }),
    });
    expect(res.status).toBe(401);
  });

  it("devuelve 404 si el volumen no existe", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.volumen.findUnique).mockResolvedValue(null);
    const res = await GET(makeRequest({ files: "foto.jpg" }), {
      params: Promise.resolve({ id: "v1" }),
    });
    expect(res.status).toBe(404);
  });

  it("devuelve 400 si no se especifican ficheros", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.volumen.findUnique).mockResolvedValue(
      mockVolumen as never,
    );
    const res = await GET(makeRequest({}), {
      params: Promise.resolve({ id: "v1" }),
    });
    expect(res.status).toBe(400);
  });

  it("devuelve 400 si el path contiene path traversal", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.volumen.findUnique).mockResolvedValue(
      mockVolumen as never,
    );
    const res = await GET(makeRequest({ path: "../../etc", files: "passwd" }), {
      params: Promise.resolve({ id: "v1" }),
    });
    expect(res.status).toBe(400);
  });

  it("genera ZIP y devuelve application/zip con nombre correcto", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.volumen.findUnique).mockResolvedValue(
      mockVolumen as never,
    );
    vi.mocked(readFile).mockResolvedValue(Buffer.from("contenido") as never);

    const res = await GET(makeRequest({ files: "foto.jpg" }), {
      params: Promise.resolve({ id: "v1" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    const cd = res.headers.get("Content-Disposition") ?? "";
    expect(cd).toMatch(/attachment;\s*filename="galeria-\d+\.zip"/);
  });

  it("incluye todos los ficheros solicitados en el ZIP", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.volumen.findUnique).mockResolvedValue(
      mockVolumen as never,
    );
    vi.mocked(readFile).mockResolvedValue(Buffer.from("datos") as never);

    const { zip } = await import("fflate");
    await GET(makeRequest({ files: "a.jpg,b.png" }), {
      params: Promise.resolve({ id: "v1" }),
    });

    expect(zip).toHaveBeenCalledOnce();
    const entradas = vi.mocked(zip).mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(entradas)).toContain("a.jpg");
    expect(Object.keys(entradas)).toContain("b.png");
  });
});
