import { readFileSync, statfsSync, existsSync } from "fs";
import { cpus, loadavg } from "os";

export type MetricasSistema = {
  cpu: number;
  ram: { usado: number; total: number; unidad: "GB" };
  disco: { usado: number; total: number; unidad: "GB" };
};

type CpuSnapshot = { total: number; ocioso: number };
let _prevCpu: CpuSnapshot | null = null;

export function _resetCpuCache(): void {
  _prevCpu = null;
}

function parsearCpu(): number {
  const linea = readFileSync("/host/proc/stat", "utf8").split("\n")[0];
  const campos = linea
    .replace(/^cpu\s+/, "")
    .split(/\s+/)
    .map(Number);
  const [user, nice, system, idle, iowait, irq, softirq, steal] = campos;
  const ocioso = idle + iowait;
  const total = user + nice + system + idle + iowait + irq + softirq + steal;

  if (_prevCpu === null) {
    _prevCpu = { total, ocioso };
    return Math.min(100, (loadavg()[0] / cpus().length) * 100);
  }

  const deltaTotal = total - _prevCpu.total;
  const deltaOcioso = ocioso - _prevCpu.ocioso;
  _prevCpu = { total, ocioso };

  if (deltaTotal === 0) return 0;
  return Math.min(
    100,
    Math.max(0, ((deltaTotal - deltaOcioso) / deltaTotal) * 100),
  );
}

function parsearRam(): MetricasSistema["ram"] {
  const contenido = readFileSync("/host/proc/meminfo", "utf8");
  const extraer = (clave: string): number => {
    const m = contenido.match(new RegExp(`^${clave}:\\s+(\\d+)`, "m"));
    return m ? parseInt(m[1], 10) : 0;
  };
  const totalKb = extraer("MemTotal");
  const disponibleKb = extraer("MemAvailable");
  return {
    usado: parseFloat(((totalKb - disponibleKb) / 1_048_576).toFixed(1)),
    total: parseFloat((totalKb / 1_048_576).toFixed(1)),
    unidad: "GB",
  };
}

function parsearDisco(): MetricasSistema["disco"] {
  // NOTE: statfsSync requires Node 19.6+ — available on Node 24
  const stats = statfsSync("/hostroot");
  const totalBytes = stats.bsize * stats.blocks;
  const libresBytes = stats.bsize * stats.bavail;
  return {
    usado: parseFloat(((totalBytes - libresBytes) / 1_073_741_824).toFixed(1)),
    total: parseFloat((totalBytes / 1_073_741_824).toFixed(1)),
    unidad: "GB",
  };
}

const DATOS_DEV: MetricasSistema = {
  cpu: 42,
  ram: { usado: 3.2, total: 8.0, unidad: "GB" },
  disco: { usado: 48.5, total: 100.0, unidad: "GB" },
};

export function obtenerMetricas(): MetricasSistema {
  if (process.env.NODE_ENV !== "production" || !existsSync("/host/proc/stat")) {
    return DATOS_DEV;
  }
  try {
    return {
      cpu: parseFloat(parsearCpu().toFixed(1)),
      ram: parsearRam(),
      disco: parsearDisco(),
    };
  } catch {
    return DATOS_DEV;
  }
}
