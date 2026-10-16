import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { docker, generarClaveSsh, type EntornoGuia } from "./entorno";

export const USUARIO_DEMO = {
  email: "guia@vicalba.local",
  password: "guia-demo-2026",
  nombre: "Laura Martín",
};

const hace = (minutos: number) => new Date(Date.now() - minutos * 60_000);
const HORA = 60;
const DIA = 24 * HORA;

function salidaDeploy(
  sha: string,
  final: "exito" | "error" | "en_curso",
): string {
  const lineas = [
    "→ Clonando repositorio git@github.com:demo/repo.git",
    "Cloning into '/var/vicalba/repos/demo'...",
    "→ Haciendo checkout de main",
    `→ SHA: ${sha}`,
    "→ Construyendo e iniciando contenedores",
    "#1 [internal] load build definition from Dockerfile",
    "#5 [builder 2/6] RUN npm ci",
    "#5 added 412 packages in 18s",
    "#7 [builder 4/6] RUN npm run build",
  ];
  if (final === "en_curso") return lineas.join("\n");
  if (final === "error") {
    return [
      ...lineas,
      'npm ERR! Missing script: "build"',
      '#7 ERROR: process "/bin/sh -c npm run build" did not complete successfully: exit code: 1',
      "✗ docker compose up falló",
    ].join("\n");
  }
  return [
    ...lineas,
    "#7 DONE 41.2s",
    " Container app  Started",
    "→ Conectando red y proxy",
    "✓ Deploy completado",
  ].join("\n");
}

const COMPOSE_INTRANET = `services:
  app:
    image: nginx:alpine
    restart: unless-stopped
    volumes:
      - ./html:/usr/share/nginx/html:ro
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: \${DB_PASSWORD}
`;

export async function sembrar(
  entorno: EntornoGuia,
  claveSftp: { publica: string; privada: string },
): Promise<void> {
  const url = `postgresql://vicalba:${entorno.DB_PASSWORD}@localhost:5434/vicalba`;
  // src/env.ts validates these at import time; cifrar() must use the panel's key.
  Object.assign(process.env, {
    DATABASE_URL: url,
    NEXTAUTH_SECRET: entorno.NEXTAUTH_SECRET,
    NEXTAUTH_URL: entorno.NEXTAUTH_URL,
    GITHUB_WEBHOOK_SECRET: entorno.GITHUB_WEBHOOK_SECRET,
    ENCRYPTION_KEY: entorno.ENCRYPTION_KEY,
  });
  const { cifrar } = await import("@/lib/crypto");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  try {
    await prisma.user.createMany({
      data: [
        {
          email: USUARIO_DEMO.email,
          nombre: USUARIO_DEMO.nombre,
          passwordHash: await bcrypt.hash(USUARIO_DEMO.password, 12),
        },
        {
          email: "carlos@vicalba.local",
          nombre: "Carlos Ruiz",
          passwordHash: await bcrypt.hash(randomBytes(16).toString("hex"), 12),
        },
      ],
    });

    const credencial = async (
      nombre: string,
      clave: { publica: string; privada: string },
    ) => {
      const c = cifrar(clave.privada);
      return prisma.credencial.create({
        data: {
          nombre,
          clavePublica: clave.publica,
          clavePrivadaCifrada: c.valorCifrado,
          iv: c.iv,
          authTag: c.authTag,
        },
      });
    };
    await credencial("Servidor de copias", claveSftp);
    const github = await credencial("GitHub — despliegues", generarClaveSsh());

    const [acme, tienda, estudio] = await Promise.all([
      prisma.cliente.create({
        data: { slug: "acme", nombre: "ACME Logística" },
      }),
      prisma.cliente.create({
        data: { slug: "tienda-mari", nombre: "Tienda Mari" },
      }),
      prisma.cliente.create({
        data: { slug: "estudio-norte", nombre: "Estudio Norte" },
      }),
    ]);

    const web = await prisma.proyecto.create({
      data: {
        nombre: "web",
        clienteId: acme.id,
        tipo: "compose",
        estado: "running",
        rutas: { create: { dominio: "web.acme.example.com", puerto: 80 } },
        repositorioUrl: "git@github.com:acme/web.git",
        rama: "main",
        autoDeployHabilitado: true,
        credencialId: github.id,
        ultimoDeployEn: hace(2 * HORA),
        ultimoDeployRama: "main",
      },
    });
    const api = await prisma.proyecto.create({
      data: {
        nombre: "api",
        clienteId: acme.id,
        tipo: "dockerfile",
        estado: "error",
        rutas: { create: { dominio: "api.acme.example.com", puerto: 3000 } },
        repositorioUrl: "git@github.com:acme/api.git",
        dockerfilePath: "Dockerfile",
        puerto: 3000,
        credencialId: github.id,
        ultimoDeployEn: hace(40),
        ultimoDeployRama: "main",
      },
    });
    const tiendaWeb = await prisma.proyecto.create({
      data: {
        nombre: "tienda",
        clienteId: tienda.id,
        tipo: "nodejs",
        estado: "running",
        rutas: { create: { dominio: "tienda-mari.example.com", puerto: 3000 } },
        repositorioUrl: "https://github.com/tienda-mari/tienda.git",
        puerto: 3000,
        buildCommand: "npm run build",
        startCommand: "npm start",
        ultimoDeployEn: hace(5 * HORA),
        ultimoDeployRama: "main",
      },
    });
    const blog = await prisma.proyecto.create({
      data: {
        nombre: "blog",
        clienteId: tienda.id,
        tipo: "image",
        estado: "stopped",
        rutas: {
          create: { dominio: "blog.tienda-mari.example.com", puerto: 2368 },
        },
        imagenUrl: "ghost:5-alpine",
        puerto: 2368,
        ultimoDeployEn: hace(DIA),
      },
    });
    await prisma.proyecto.create({
      data: {
        nombre: "intranet",
        clienteId: estudio.id,
        tipo: "compose",
        estado: "running",
        rutas: {
          create: { dominio: "intranet.estudio-norte.example.com", puerto: 80 },
        },
        composeContent: COMPOSE_INTRANET,
        ultimoDeployEn: hace(3 * DIA),
      },
    });
    const landing = await prisma.proyecto.create({
      data: {
        nombre: "landing",
        clienteId: estudio.id,
        tipo: "compose",
        estado: "deploying",
        rutas: { create: { dominio: "estudio-norte.example.com", puerto: 80 } },
        repositorioUrl: "git@github.com:estudio-norte/landing.git",
        rama: "main",
        ultimoDeployEn: hace(1),
        ultimoDeployRama: "main",
      },
    });

    const deploy = (
      proyectoId: string,
      sha: string,
      resultado: "exito" | "error" | "cancelado" | "en_curso",
      origen: "manual" | "webhook" | "rollback",
      minutos: number,
    ) => ({
      proyectoId,
      rama: "main",
      sha,
      resultado,
      origen,
      iniciadoEn: hace(minutos),
      finalizadoEn: resultado === "en_curso" ? null : hace(minutos - 2),
      // A cancelled deploy stops where it was, like one still running.
      output: salidaDeploy(
        sha,
        resultado === "exito" || resultado === "error" ? resultado : "en_curso",
      ),
    });
    await prisma.deploy.createMany({
      data: [
        deploy(
          web.id,
          "3f9c2a1d8e7b6c5a4f3e2d1c0b9a8f7e6d5c4b3a",
          "exito",
          "manual",
          3 * DIA,
        ),
        deploy(
          web.id,
          "8b41d07c3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b",
          "exito",
          "webhook",
          DIA,
        ),
        deploy(
          web.id,
          "c72e5f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e",
          "exito",
          "webhook",
          2 * HORA,
        ),
        deploy(
          api.id,
          "5d1e9b4f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d",
          "exito",
          "manual",
          2 * DIA,
        ),
        deploy(
          api.id,
          "a90f3c2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a",
          "error",
          "webhook",
          40,
        ),
        deploy(
          tiendaWeb.id,
          "e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5",
          "exito",
          "manual",
          5 * HORA,
        ),
        deploy(
          blog.id,
          "f1e2d3c4b5a6978877665544332211009988aabb",
          "cancelado",
          "manual",
          DIA,
        ),
        deploy(
          landing.id,
          "0a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3",
          "en_curso",
          "webhook",
          1,
        ),
      ],
    });

    const variable = (clave: string, valor: string, enBuildTime = false) => {
      const c = cifrar(valor);
      return {
        proyectoId: web.id,
        clave,
        valorCifrado: c.valorCifrado,
        iv: c.iv,
        authTag: c.authTag,
        enBuildTime,
      };
    };
    await prisma.variableEntorno.createMany({
      data: [
        variable("NODE_ENV", "production"),
        variable("DATABASE_URL", "postgresql://web:demo@db:5432/web"),
        variable("SMTP_PASSWORD", "demo-no-real"),
        variable("NEXT_PUBLIC_SITE_URL", "https://web.acme.example.com", true),
      ],
    });

    await prisma.volumen.create({
      data: {
        proyectoId: web.id,
        nombre: "uploads",
        rutaContenedor: "/app/uploads",
      },
    });
    // Path from rutaHostVolumen() in src/lib/volumenes.ts, inside the panel container.
    docker([
      "exec",
      "-u",
      "1001",
      "vicalba-panel",
      "sh",
      "-c",
      'd=/var/vicalba/repos/acme/web/volumes/uploads; mkdir -p "$d/productos" && printf demo > "$d/logo.png" && printf demo > "$d/productos/camiseta.jpg" && printf "a,b\\n1,2\\n" > "$d/catalogo.csv"',
    ]);

    await prisma.configuracionDeploy.upsert({
      where: { id: "default" },
      create: { id: "default", timeoutMinutos: 30 },
      update: { timeoutMinutos: 30 },
    });

    const token = cifrar("000000:demo");
    const notificaciones = {
      webhookHabilitado: true,
      webhookUrl: "https://hooks.slack.com/services/T000/B000/demo",
      webhookUltimoEnvioEn: hace(2 * HORA),
      webhookUltimoError: null,
      telegramHabilitado: true,
      telegramChatId: "-100123456",
      telegramBotTokenCifrado: token.valorCifrado,
      telegramBotTokenIv: token.iv,
      telegramBotTokenTag: token.authTag,
      telegramUltimoEnvioEn: hace(2 * HORA),
      telegramUltimoError: null,
      emailHabilitado: false,
    };
    await prisma.configuracionNotificacion.upsert({
      where: { id: "default" },
      create: { id: "default", ...notificaciones },
      update: notificaciones,
    });

    await prisma.backup.createMany({
      data: [
        {
          operacion: "copia",
          origen: "programado",
          resultado: "exito",
          iniciadoEn: hace(2 * DIA),
          finalizadoEn: hace(2 * DIA - 1),
          bytesAnadidos: BigInt(1_843_200),
        },
        {
          operacion: "copia",
          origen: "programado",
          resultado: "error",
          iniciadoEn: hace(DIA),
          finalizadoEn: hace(DIA - 1),
          error: "El destino no responde (30 s): Stat: dial tcp: i/o timeout",
        },
        {
          operacion: "restauracion",
          origen: "manual",
          resultado: "exito",
          iniciadoEn: hace(20 * HORA),
          finalizadoEn: hace(20 * HORA - 1),
        },
      ],
    });
  } finally {
    await prisma.$disconnect();
  }
}
