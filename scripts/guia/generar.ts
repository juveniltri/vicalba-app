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
} from "./entorno";
import { capturar, entrar, imprimirPdf } from "./capturas";
import { sembrar } from "./datos-demo";

async function main(): Promise<void> {
  if (process.argv.includes("--limpiar")) {
    limpiar();
    console.log("Entorno de la guía eliminado.");
    return;
  }
  comprobarRequisitos();
  try {
    const entorno = generarEnv();
    compose(["up", "-d", "--build"]);
    await esperarPanelSano();
    prepararVolumenes();
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
    limpiar();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
