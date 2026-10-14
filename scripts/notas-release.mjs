// Uso: node scripts/notas-release.mjs 2.1.1 > notas.md
// Node 22 ejecuta el .ts sin compilar (type stripping), así la Release usa el
// mismo parser que la página Novedades.
import { leerChangelog, notasDeRelease } from "../src/lib/changelog.ts";

const numero = process.argv[2];
const version = (await leerChangelog()).find((v) => v.version === numero);

if (!version) {
  console.error(`CHANGELOG.md no tiene la entrada ## [${numero}]`);
  process.exit(1);
}
process.stdout.write(notasDeRelease(version));
