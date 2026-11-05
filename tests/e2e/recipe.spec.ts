import { expect, test } from "@playwright/test";

test("serves a standalone external feature recipe and registry index", async ({ request }) => {
  const indexResponse = await request.get("/registry/registry.json");
  expect(indexResponse.ok()).toBe(true);
  const index = await indexResponse.json();
  expect(index.items["browser-chat"].type).toBe("registry:feature");

  const response = await request.get("/registry/features/browser-chat.md");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).not.toContain("text/html");
  const recipe = await response.text();
  expect(recipe).toMatch(/^---\n\{/);
  expect(recipe).toContain('"name": "browser-chat"');
  expect(recipe).toContain("### `src/components/chat/Chat.tsx`");
  expect(recipe).toContain("### `src/lib/chat/mcp.ts`");
  expect(recipe).toContain("### `src/lib/chat/browser-runtime.ts`");
  expect(recipe).toContain("https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/");
  expect(recipe).not.toContain("<!-- CHAT_RECIPE_");
});
