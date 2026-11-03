import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const webDirectory = resolve(root, "www");

await mkdir(webDirectory, { recursive: true });

for (const filename of ["index.html", "style.css", "app.js"]) {
  await copyFile(resolve(root, filename), resolve(webDirectory, filename));
}

console.log("Prepared index.html, style.css and app.js in www/.");
