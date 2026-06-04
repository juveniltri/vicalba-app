// src/server/routers/proyectos.ts
import { formatHace } from "@/lib/formatHace";
import { prisma } from "@/lib/prisma";
import { protectedProcedure, router } from "@/server/trpc";

export const proyectosRouter = router({
  listar: protectedProcedure.query(async () => {
    const clientes = await prisma.cliente.findMany({
      include: {
        proyectos: {
          include: { servicios: true },
          orderBy: { nombre: "asc" },
        },
      },
      orderBy: { nombre: "asc" },
    });

    return clientes.map((cliente) => ({
      slug: cliente.slug,
      nombre: cliente.nombre,
      proyectos: cliente.proyectos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        clienteSlug: cliente.slug,
        estado: p.estado,
        dominio: p.dominio,
        servicios: p.servicios.map((s) => ({
          nombre: s.nombre,
          estado: s.estado,
        })),
        ultimoDeploy:
          p.ultimoDeployEn && p.ultimoDeployRama
            ? { hace: formatHace(p.ultimoDeployEn), rama: p.ultimoDeployRama }
            : null,
      })),
    }));
  }),
});
