import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { codeBlock, createRecipe, recipeFiles } from "../../scripts/build-chat-recipe.mjs";

it("exports Nimbus feature metadata and source files without changing their contents", async () => {
  const output = await createRecipe();
  const markdown = output.get("features/browser-chat.md")!;
  const metadata = JSON.parse(markdown.match(/^---\n([\s\S]*?)\n---\n/)![1]!);
  const index = JSON.parse(output.get("registry.json")!);
  expect(index.items[metadata.name]).toEqual({ name: "browser-chat", type: "registry:feature", title: metadata.title, description: metadata.description });
  const files = [...markdown.matchAll(/^### `([^`]+)`\n\n(`{3,})\w+\n([\s\S]*?)^\2$/gm)];
  expect(files.map(match => match[1])).toEqual(recipeFiles);
  for (const [, path, , content] of files) expect(content).toBe(await readFile(resolve(path!), "utf8"));
  expect(markdown).not.toContain("<!-- CHAT_RECIPE_");
  expect(markdown).not.toContain(process.cwd());
  expect(files.some(match => /(^|\/)\.env|node_modules\/|references\/|\.gguf$|\.wasm$/.test(match[1]!))).toBe(false);
});

it("keeps embedded Markdown fences and literal replacement tokens intact", () => {
  const source = "```ts\nconst template = '$&';\n```\n";
  expect(codeBlock(source, "md")).toBe(`\`\`\`\`md\n${source}\`\`\`\`\n`);
});

it("prints the same standalone recipe with no status messages on stdout", async () => {
  const { stdout, stderr } = await promisify(execFile)(process.execPath, ["scripts/build-chat-recipe.mjs", "--print"]);
  expect(stdout).toBe((await createRecipe()).get("features/browser-chat.md"));
  expect(stderr).toBe("");
});

it.each(["browser-chat", "https://example.com/registry/features/browser-chat.md"])("documents the stock Nimbus CLI's external feature limitation: %s", async slug => {
  const cli = resolve("node_modules/@cloudflare/nimbus-docs/dist/cli/index.js");
  const result = await promisify(execFile)(process.execPath, [cli, "add", slug, "--print"], {
    env: { ...process.env, NIMBUS_REGISTRY_URL: "http://127.0.0.1:1/registry" },
    timeout: 10_000,
  }).then(
    output => ({ code: 0, output: output.stdout + output.stderr }),
    (error: { code: number; stdout: string; stderr: string }) => ({ code: error.code, output: error.stdout + error.stderr }),
  );
  expect(result.code).toBe(1);
  expect(result.output).toContain("Unknown registry item");
  expect(result.output).not.toContain("Could not reach the registry");
});
