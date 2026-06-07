import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.proyecto.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("dev-password-2026", 12);
  await prisma.user.create({
    data: { email: "admin@vicalba.local", passwordHash, nombre: "Admin" },
  });

  const clienteUno = await prisma.cliente.create({
    data: { slug: "cliente-uno", nombre: "Cliente Uno" },
  });

  await prisma.proyecto.create({
    data: {
      nombre: "web-app",
      clienteId: clienteUno.id,
      estado: "running",
      dominio: "app.cliente-uno.com",
      ultimoDeployEn: new Date(Date.now() - 2 * 60 * 60 * 1000),
      ultimoDeployRama: "main",
    },
  });

  await prisma.proyecto.create({
    data: {
      nombre: "api",
      clienteId: clienteUno.id,
      estado: "stopped",
      dominio: "api.cliente-uno.com",
      ultimoDeployEn: new Date(Date.now() - 5 * 60 * 60 * 1000),
      ultimoDeployRama: "main",
    },
  });

  const clienteDos = await prisma.cliente.create({
    data: { slug: "cliente-dos", nombre: "Cliente Dos" },
  });

  await prisma.proyecto.create({
    data: {
      nombre: "landing",
      clienteId: clienteDos.id,
      estado: "error",
      dominio: "landing.cliente-dos.com",
      ultimoDeployEn: new Date(Date.now() - 24 * 60 * 60 * 1000),
      ultimoDeployRama: "main",
    },
  });

  await prisma.proyecto.create({
    data: {
      nombre: "worker",
      clienteId: clienteDos.id,
      estado: "deploying",
      dominio: null,
      ultimoDeployEn: new Date(Date.now() - 10 * 60 * 1000),
      ultimoDeployRama: "develop",
    },
  });

  console.log("✅ Seed completado");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
