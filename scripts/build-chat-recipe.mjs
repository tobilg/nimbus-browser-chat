import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

// An explicit list keeps private files, generated assets, and unrelated site code
// out of the public recipe. The running implementation stays the source of truth.
export const recipeFiles = Object.freeze([
  "src/pages/chat.astro",
  "src/components/chat/Chat.tsx",
  "src/components/chat/chat.css",
  "src/lib/chat/models.ts",
  "src/lib/chat/model-cache.ts",
  "src/lib/chat/inference-stream.ts",
  "src/lib/chat/mcp.ts",
  "src/lib/chat/agent.ts",
  "src/lib/chat/browser-runtime.ts",
  "scripts/copy-wasm.mjs",
  "src/middleware.ts",
  "src/content/docs/browser-chat.mdx",
  "tests/unit/model-cache.test.ts",
  "tests/unit/inference-stream.test.ts",
  "tests/unit/agent.test.ts",
  "tests/e2e/chat.spec.ts",
  "tests/e2e/models.spec.ts",
  "vitest.config.ts",
  "playwright.config.ts",
]);

const dependencies = [
  "@assistant-ui/react", "@assistant-ui/react-markdown", "@astrojs/react",
  "@modelcontextprotocol/client", "@modelcontextprotocol/server", "@phosphor-icons/react",
  "@wllama/wllama", "@wllama/wllama-compat", "react", "react-dom", "remark-gfm",
];
const devDependencies = ["@astrojs/check", "@playwright/test", "@types/react", "@types/react-dom", "typescript", "vitest"];

export function codeBlock(content, language) {
  const longest = Math.max(2, ...Array.from(content.matchAll(/`+/g), match => match[0].length));
  const fence = "`".repeat(longest + 1);
  return `${fence}${language}\n${content}${content.endsWith("\n") ? "" : "\n"}${fence}\n`;
}

export async function createRecipe(root = projectRoot) {
  const [template, lockText] = await Promise.all([
    readFile(join(root, "registry/browser-chat.md"), "utf8"),
    readFile(join(root, "package-lock.json"), "utf8"),
  ]);
  const frontmatter = template.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatter) throw new Error("The recipe must start with Nimbus JSON frontmatter.");
  const metadata = JSON.parse(frontmatter[1]);
  if (metadata.name !== "browser-chat" || metadata.type !== "registry:feature"
    || typeof metadata.title !== "string" || typeof metadata.description !== "string") {
    throw new Error("Invalid browser-chat feature metadata.");
  }
  const lock = JSON.parse(lockText);
  const versionOf = name => {
    const version = lock.packages?.[`node_modules/${name}`]?.version;
    if (typeof version !== "string") throw new Error(`Missing locked dependency: ${name}`);
    return version;
  };
  const versions = names => Object.fromEntries(names.map(name => [name, versionOf(name)]));
  const dependencyText = [
    `Reference environment: Nimbus **${versionOf("@cloudflare/nimbus-docs")}**, Astro **${versionOf("astro")}**, Node.js **${lock.packages[""].engines.node}**.`,
    "These are the exact versions in the reference lockfile. Merge the dependencies needed by the target site; preserve its package manager and lockfile. Resolve compatibility with an existing React/Astro setup before changing versions.",
    codeBlock(JSON.stringify({ dependencies: versions(dependencies), devDependencies: versions(devDependencies) }, null, 2), "json"),
  ].join("\n\n");
  const files = await Promise.all(recipeFiles.map(async path => ({ path, content: await readFile(join(root, path), "utf8") })));
  const fileText = files.map(({ path, content }) => {
    const language = path.split(".").at(-1) === "mjs" ? "js" : path.split(".").at(-1);
    return `### \`${path}\`\n\n${codeBlock(content, language)}`;
  }).join("\n");
  let markdown = template;
  for (const [marker, content] of [["<!-- CHAT_RECIPE_DEPENDENCIES -->", dependencyText], ["<!-- CHAT_RECIPE_FILES -->", fileText]]) {
    if (markdown.split(marker).length !== 2) throw new Error(`Expected exactly one ${marker} marker.`);
    // A callback preserves literal replacement tokens such as $& in source code.
    markdown = markdown.replace(marker, () => content);
  }
  const { name, type, title, description } = metadata;
  const index = { version: 1, registryVersion: versionOf("@cloudflare/nimbus-docs"), items: { [name]: { name, type, title, description } } };
  return new Map([
    ["features/browser-chat.md", markdown],
    ["registry.json", `${JSON.stringify(index, null, 2)}\n`],
  ]);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !["--print", "--check"].includes(arg))) {
    throw new Error("Usage: node scripts/build-chat-recipe.mjs [--print | --check]");
  }
  const outputs = await createRecipe();
  if (args.includes("--print")) {
    process.stdout.write(outputs.get("features/browser-chat.md"));
    return;
  }
  for (const [path, content] of outputs) {
    const destination = join(projectRoot, "public/registry", path);
    if (args.includes("--check")) {
      const existing = await readFile(destination, "utf8").catch(error => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      });
      if (existing !== content) throw new Error(`Recipe output ${path} is missing or stale. Run npm run recipe:build.`);
    } else {
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, content);
    }
  }
  console.log(args.includes("--check") ? "Chat recipe is up to date." : `Built public/registry/features/browser-chat.md (${recipeFiles.length} reference files) and registry.json.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
