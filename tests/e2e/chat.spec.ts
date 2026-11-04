import { expect, test } from "@playwright/test";

test("models stay unloaded until a prompt and explicit consent", async ({ page }) => {
  const modelRequests: string[] = [];
  page.on("request", request => { if (/\.gguf|\/wasm\//.test(request.url())) modelRequests.push(request.url()); });
  await page.goto("/chat");
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Model", exact: true }).selectOption("qwen3.5-2b");
  await page.getByRole("switch", { name: "Thinking", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Thinking", exact: true })).toHaveAttribute("aria-checked", "true");
  expect(modelRequests).toEqual([]);
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("How do I start?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("1.28 GB");
  expect(modelRequests).toEqual([]);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("combobox", { name: "Model", exact: true })).toBeEnabled();
  expect(modelRequests).toEqual([]);
});

test("failed downloads expose a recoverable error", async ({ page }) => {
  await page.route("https://huggingface.co/**", route => route.abort("failed"));
  await page.goto("/chat");
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Tell me about browser chat.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("button", { name: "Download and continue" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Model", exact: true })).toBeEnabled();
});

test("stopping a pending download releases the composer and requires consent again", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("https://huggingface.co/**", async route => { await pending; await route.abort().catch(() => {}); });
  try {
    await page.goto("/chat");
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("How do I start?");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await page.getByRole("button", { name: "Download and continue" }).click();
    await page.getByRole("button", { name: "Stop response", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Model", exact: true })).toBeEnabled();
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("Try again.");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
  } finally { release(); }
});

test("mobile and dark theme retain usable controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/chat");
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);
  await page.screenshot({ path: "test-results/chat-mobile-dark.png", fullPage: true });
});

test("the local Nimbus MCP endpoint initializes and serves documentation", async ({ request }) => {
  const rpc = async (id: number, method: string, params: Record<string, unknown> = {}) => {
    const response = await request.post("/mcp", { headers: { Accept: "application/json, text/event-stream" }, data: { jsonrpc: "2.0", id, method, params } });
    expect(response.ok()).toBe(true);
    const data = await response.json(); expect(data.error).toBeUndefined(); return data.result;
  };
  const initialized = await rpc(1, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "nimbus-test", version: "1.0" } });
  expect(initialized.serverInfo.name).toContain("docs");
  const tools = await rpc(2, "tools/list"); expect(tools.tools.map((tool: { name: string }) => tool.name).sort()).toEqual(["get_page", "list_pages"]);
  const pages = await rpc(3, "tools/call", { name: "list_pages", arguments: {} }); expect(JSON.stringify(pages)).toContain("Browser chat");
  const page = await rpc(4, "tools/call", { name: "get_page", arguments: { url: "/browser-chat" } }); expect(JSON.stringify(page)).toContain("wllama");
});
