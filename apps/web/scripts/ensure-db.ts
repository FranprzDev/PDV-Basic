import { mkdirSync, rmSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const DATA_DIR = "./data/pglite";

async function main() {
  // PGlite no crea el directorio padre, y en un clon limpio ./data no existe.
  mkdirSync(DATA_DIR, { recursive: true });

  try {
    const pg = new PGlite(DATA_DIR);
    await pg.query("SELECT 1");
    await pg.close();
  } catch {
    console.warn("⚠ PGLite corrompido — limpiando para recreación automática...");
    rmSync(DATA_DIR, { recursive: true, force: true });
  }
}

main();
