import {
  arrancarContenedoresDemo,
  arrancarSftp,
  comprobarRequisitos,
  compose,
  docker,
  esperarPanelSano,
  generarClaveSsh,
  generarEnv,
  limpiar,
  prepararVolumenes,
  reiniciarPanel,
} from "./entorno";
import { capturar, entrar, imprimirPdf } from "./capturas";
import { sembrar } from "./datos-demo";

let limpiado = false;
function limpiarUnaVez(): void {
  if (limpiado) return;
  limpiado = true;
  limpiar();
}

// Node exits on Ctrl+C without running `finally`: clean up here too.
for (const senal of ["SIGINT", "SIGTERM"] as const) {
  process.once(senal, () => {
    console.log("Interrumpido: limpiando el entorno de la guía…");
    limpiarUnaVez();
    process.exit(130);
  });
}

async function main(): Promise<void> {
  if (process.argv.includes("--limpiar")) {
    limpiarUnaVez();
    console.log("Entorno de la guía eliminado.");
    return;
  }
  await comprobarRequisitos();
  try {
    const entorno = generarEnv();
    compose(["up", "-d", "--build"]);
    await esperarPanelSano();
    prepararVolumenes();
    await reiniciarPanel();
    const claveSftp = generarClaveSsh();
    await arrancarSftp(claveSftp.publica);
    await sembrar(entorno, claveSftp);
    arrancarContenedoresDemo();
    if (process.argv.includes("--pausa")) {
      console.log(
        "Stack de la guía en https://localhost. Pulsa Enter para limpiar.",
      );
      // Without "end", a closed stdin lets Node exit here and skip the cleanup.
      await new Promise((r) => {
        process.stdin.once("data", r);
        process.stdin.once("end", r);
      });
      return;
    }
    const { chromium } = await import("@playwright/test");
    const navegador = await chromium.launch();
    try {
      const contexto = await navegador.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 900 },
        colorScheme: "light",
      });
      const page = await contexto.newPage();
      await entrar(page);
      await capturar(page);
      // The image was built before the captures: serve the fresh guide and PNGs.
      docker([
        "cp",
        "docs/guia-usuario.md",
        "vicalba-panel:/app/docs/guia-usuario.md",
      ]);
      docker(["cp", "public/guia/.", "vicalba-panel:/app/public/guia/"]);
      docker(["restart", "vicalba-panel"]);
      await esperarPanelSano();
      await entrar(page);
      await imprimirPdf(page);
      console.log("Guía generada en public/guia/.");
    } finally {
      await navegador.close();
    }
  } finally {
    limpiarUnaVez();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
