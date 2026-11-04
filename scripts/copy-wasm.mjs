import { copyFile, mkdir } from "node:fs/promises";
const directory = new URL("../public/wasm/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const [source, destination] of [
  ["@wllama/wllama/esm/wasm/wllama.wasm", "wllama.wasm"],
  ["@wllama/wllama-compat/wasm/wllama.wasm", "wllama-compat.wasm"],
  ["@wllama/wllama-compat/wasm/wllama.js", "wllama-compat.js"],
]) {
  await copyFile(new URL(`../node_modules/${source}`, import.meta.url), new URL(destination, directory));
}
