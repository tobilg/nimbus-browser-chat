import { describe, expect, it, vi } from "vitest";
import type { ChatCompletionChunk, ChatCompletionChunkDelta, ChatCompletionParams } from "@wllama/wllama";
import { chooseStartingPage, runDocumentationAgent, type GenerationSnapshot } from "../../src/lib/chat/agent";
import { validateToolArguments, type DocumentationClient } from "../../src/lib/chat/mcp";

function chunk(delta: ChatCompletionChunkDelta): ChatCompletionChunk {
  return { id: "test", object: "chat.completion.chunk", created: 0, model: "test", choices: [{ index: 0, delta, finish_reason: null, logprobs: null }] };
}
async function* stream(deltas: ChatCompletionChunkDelta[]) { for (const delta of deltas) yield chunk(delta); }
function client(): DocumentationClient {
  return { tools: [], call: vi.fn(async name => name === "list_pages" ? { pages: [{ title: "Guide", url: "/guide" }] } : { title: "Guide", url: "/guide", content: "Run npm install." }), close: vi.fn() };
}
const history = [{ role: "user" as const, content: "How do I start?" }];

describe("documentation agent", () => {
  it("streams cumulative answers and forwards the thinking setting", async () => {
    for (const thinking of [false, true]) {
      const inference = { createChatCompletion: vi.fn(async () => stream([{ content: "Hello" }, { content: " world" }])) };
      const snapshots: GenerationSnapshot[] = [];
      for await (const result of runDocumentationAgent(inference, client(), history, thinking, new AbortController().signal)) snapshots.push(result);
      expect(snapshots.some(result => result.text === "Hello")).toBe(true);
      expect(snapshots.at(-1)?.text).toBe("Hello world");
      expect(inference.createChatCompletion).toHaveBeenCalledWith(expect.objectContaining({ stream: true, chat_template_kwargs: { enable_thinking: thinking } }));
      expect(inference.createChatCompletion).toHaveBeenCalledWith(expect.objectContaining({ messages: expect.arrayContaining([expect.objectContaining({ role: "tool", content: expect.stringContaining("npm install") })]) }));
    }
  });
  it("assembles fragmented tool arguments, calls MCP, and returns the result to the model", async () => {
    const mcp = client(); const requests: ChatCompletionParams[] = [];
    const inference = { createChatCompletion: vi.fn(async (options: ChatCompletionParams) => {
      requests.push(structuredClone({ ...options, abortSignal: undefined }));
      return requests.length === 1 ? stream([
        { tool_calls: [{ index: 0, id: "read", function: { name: "get_page", arguments: '{"ur' } }] },
        { tool_calls: [{ index: 0, function: { arguments: 'l":"/guide"}' } }] },
      ]) : stream([{ content: "Run npm install. [Guide](/guide)" }]);
    }) };
    let final: GenerationSnapshot | undefined;
    for await (const result of runDocumentationAgent(inference, mcp, history, false, new AbortController().signal)) final = result;
    expect(mcp.call).toHaveBeenCalledWith("get_page", { url: "/guide" }, expect.any(AbortSignal));
    expect(requests[1]?.messages).toContainEqual(expect.objectContaining({ role: "tool", tool_call_id: "read", content: expect.stringContaining("npm install") }));
    expect(final?.text).toContain("Run npm install");
    expect(final?.tools.at(-1)?.result).toMatchObject({ url: "/guide" });
  });
  it("rejects unknown tools without sending them to MCP", async () => {
    const mcp = client(); let runs = 0;
    const inference = { createChatCompletion: vi.fn(async () => ++runs === 1 ? stream([{ tool_calls: [{ index: 0, function: { name: "delete_page", arguments: "{}" } }] }]) : stream([{ content: "I cannot do that." }])) };
    for await (const _ of runDocumentationAgent(inference, mcp, history, false, new AbortController().signal)) { /* consume */ }
    expect(mcp.call).toHaveBeenCalledTimes(2);
  });
  it("stops tool loops even when the model ignores tool_choice", async () => {
    const inference = { createChatCompletion: vi.fn(async () => stream([{ tool_calls: [{ index: 0, function: { name: "get_page", arguments: '{"url":"/guide"}' } }] }])) };
    await expect(async () => { for await (const _ of runDocumentationAgent(inference, client(), history, false, new AbortController().signal)) { /* consume */ } }).rejects.toThrow("tool-call limit");
    expect(inference.createChatCompletion).toHaveBeenCalledTimes(5);
  });
  it("does not continue inference after cancellation", async () => {
    const controller = new AbortController(); const mcp = client();
    mcp.call = vi.fn(async () => { controller.abort(); return {}; });
    const inference = { createChatCompletion: vi.fn() };
    await expect(async () => { for await (const _ of runDocumentationAgent(inference, mcp, history, false, controller.signal)) { /* consume */ } }).rejects.toMatchObject({ name: "AbortError" });
    expect(inference.createChatCompletion).not.toHaveBeenCalled();
  });
  it("keeps reasoning separate from streamed answer text", async () => {
    const inference = { createChatCompletion: vi.fn(async () => stream([
      { reasoning_content: "Check the guide." } as ChatCompletionChunkDelta,
      { content: "The guide says hello." },
    ])) };
    let final: GenerationSnapshot | undefined;
    for await (const result of runDocumentationAgent(inference, client(), history, true, new AbortController().signal)) final = result;
    expect(final?.reasoning).toBe("Check the guide.");
    expect(final?.text).toBe("The guide says hello.");
  });
});

describe("MCP tool validation", () => {
  it("rejects malformed and unexpected arguments", () => {
    for (const args of [null, [], {}, { url: 42 }, { url: "/guide", execute: true }]) expect(() => validateToolArguments("get_page", args)).toThrow();
    expect(() => validateToolArguments("shell", { command: "pwd" })).toThrow();
    expect(validateToolArguments("list_pages", {})).toEqual({});
    expect(validateToolArguments("get_page", { url: "/guide" })).toEqual({ url: "/guide" });
  });
});

describe("initial documentation retrieval", () => {
  it("selects the relevant page using the published catalog", () => {
    expect(chooseStartingPage({ pages: [
      { url: "/", title: "Nimbus local chat" },
      { url: "/browser-chat", title: "Browser chat", description: "Choose a model" },
    ] }, "Read the browser chat guide and name the models")).toBe("/browser-chat");
  });
  it("does not invent page URLs for an empty catalog", () => {
    expect(chooseStartingPage({ pages: [] }, "Help")).toBeUndefined();
  });
});
