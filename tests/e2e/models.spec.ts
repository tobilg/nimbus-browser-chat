import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Avoid retaining gigabytes of model response bodies in browser traces.
test.use({ trace: "off", screenshot: "only-on-failure" });

test.describe("real browser inference", () => {
  test.skip(process.env.NIMBUS_REAL_MODELS !== "1", "Opt in: downloads approximately 1.81 GB of model weights.");
  for (const model of ["qwen3.5-0.8b", "qwen3.5-2b"]) {
    test(`${model} streams, calls MCP, and reuses its cache`, async ({ playwright }) => {
      test.setTimeout(600_000);
      // Incognito contexts can impose a smaller quota than regular browser profiles.
      const profile = await mkdtemp(join(tmpdir(), "nimbus-model-test-"));
      const context = await playwright.chromium.launchPersistentContext(profile, { headless: true, baseURL: `http://localhost:${process.env.NIMBUS_TEST_PORT ?? "4321"}` });
      const page = context.pages()[0] ?? await context.newPage();
      try {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") console.log("browser:", message.text().slice(0, 300)); });
      await page.goto("/chat");
      await page.getByRole("combobox", { name: "Model", exact: true }).selectOption(model);
      await page.getByRole("textbox", { name: "Message", exact: true }).fill("Read the browser chat guide and name the two available models. Keep the answer to one sentence with a source link.");
      await page.getByRole("button", { name: "Send message", exact: true }).click();
      await page.getByRole("button", { name: "Download and continue" }).click();
      console.log(`${model}: download approved`);
      await expect(page.getByText("Generating on your device...", { exact: true }).or(page.getByRole("alert"))).toBeVisible({ timeout: 420_000 });
      await expect(page.getByRole("alert")).not.toBeVisible();
      console.log(`${model}: model loaded; generation started`);
      await expect(page.locator(".chat-markdown").last()).not.toBeEmpty({ timeout: 180_000 });
      console.log(`${model}: first streamed text`);
      await expect(page.getByRole("button", { name: "Stop response", exact: true })).not.toBeVisible({ timeout: 180_000 });
      await expect(page.getByRole("alert")).not.toBeVisible();
      await expect(page.locator(".chat-tool:not(.chat-tool-error)").filter({ hasText: "Read" }).first()).toBeVisible();
      await expect(page.locator(".chat-markdown").last()).toContainText(/Qwen/i);
      await page.screenshot({ path: `test-results/${model}-response.png`, fullPage: true });
      console.log(`${model}: ${await page.locator(".chat-markdown").last().innerText()}`);
      const downloads: string[] = [];
      page.on("request", request => { if (/\.gguf/.test(request.url())) downloads.push(request.url()); });
      await page.reload();
      await page.getByRole("combobox", { name: "Model", exact: true }).selectOption(model);
      await expect(page.getByText("Model cached in this browser", { exact: true })).toBeVisible();
      await page.getByRole("switch", { name: "Thinking", exact: true }).click();
      await page.getByRole("textbox", { name: "Message", exact: true }).fill("Say hello in one short sentence.");
      await page.getByRole("button", { name: "Send message", exact: true }).click();
      await expect(page.getByText("Generating on your device...", { exact: true })).toBeVisible({ timeout: 120_000 });
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await expect(page.locator(".chat-reasoning")).toBeVisible({ timeout: 120_000 });
      await page.getByRole("button", { name: "Stop response", exact: true }).click();
      await expect(page.getByRole("combobox", { name: "Model", exact: true })).toBeEnabled({ timeout: 30_000 });
      expect(downloads).toEqual([]);
      expect(errors).toEqual([]);
      console.log(`${model}: thinking, cancellation, and cache reuse verified`);
      } finally {
        await page.screenshot({ path: `test-results/${model}-final.png`, fullPage: true }).catch(() => {});
        await context.close();
        await rm(profile, { recursive: true, force: true });
      }
    });
  }
});
