import { docker } from "@/lib/docker/client";
import { estadoTraefik } from "@/lib/docker/traefik";
import { prisma } from "@/lib/prisma";
import { estadoCertificados } from "@/lib/ssl/acme";

type CheckStatus = "ok" | "error";

type Checks = {
  database: CheckStatus;
  docker: CheckStatus;
  proxy: CheckStatus;
  certificados: CheckStatus;
};

export type HealthResult = {
  status: "ok" | "degraded";
  checks: Checks;
  version: string;
};

const comprobar = (check: Promise<unknown>): Promise<CheckStatus> =>
  check.then(
    () => "ok",
    () => "error",
  );

export async function comprobarSalud(): Promise<HealthResult> {
  const [database, dockerCheck, proxy, certificados] = await Promise.all([
    comprobar(prisma.$queryRaw`SELECT 1`),
    comprobar(docker.ping()),
    estadoTraefik(),
    estadoCertificados(),
  ]);
  const checks: Checks = {
    database,
    docker: dockerCheck,
    proxy,
    certificados,
  };

  const healthy = Object.values(checks).every((c) => c === "ok");
  return {
    status: healthy ? "ok" : "degraded",
    checks,
    version: process.env.npm_package_version ?? "unknown",
  };
}
