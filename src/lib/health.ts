import { docker } from "@/lib/docker/client";
import { prisma } from "@/lib/prisma";

type CheckStatus = "ok" | "error";

export type HealthResult = {
  status: "ok" | "degraded";
  checks: { database: CheckStatus; docker: CheckStatus };
  version: string;
};

export async function comprobarSalud(): Promise<HealthResult> {
  const checks: { database: CheckStatus; docker: CheckStatus } = {
    database: "error",
    docker: "error",
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {}

  try {
    await docker.ping();
    checks.docker = "ok";
  } catch {}

  const healthy = checks.database === "ok" && checks.docker === "ok";
  return {
    status: healthy ? "ok" : "degraded",
    checks,
    version: process.env.npm_package_version ?? "unknown",
  };
}
