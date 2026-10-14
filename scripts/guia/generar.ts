import {
  arrancarContenedoresDemo,
  arrancarSftp,
  comprobarRequisitos,
  compose,
  esperarPanelSano,
  generarClaveSsh,
  generarEnv,
  limpiar,
  prepararVolumenes,
} from "./entorno";
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
    }
  } finally {
    limpiar();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
