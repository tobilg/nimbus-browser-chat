import { expect, it } from "vitest";
import type { ChatCompletionChunk, ChatCompletionParams } from "@wllama/wllama";
import { streamCompletion } from "../../src/lib/chat/inference-stream";

type Options = ChatCompletionParams & { stream: true; onData: (chunk: ChatCompletionChunk) => void };
const chunk: ChatCompletionChunk = { id: "test", object: "chat.completion.chunk", created: 0, model: "test", choices: [{ index: 0, delta: { content: "Hello" }, finish_reason: null, logprobs: null }] };

it("delivers callback chunks through the async stream", async () => {
  const model = { createChatCompletion: async ({ onData }: Options) => { onData(chunk); onData(chunk); } };
  const result = [];
  for await (const item of streamCompletion(model, { messages: [], stream: true })) result.push(item);
  expect(result).toEqual([chunk, chunk]);
});

it("waits for inference cleanup when a consumer leaves the stream early", async () => {
  let released = false;
  const model = { createChatCompletion: async ({ onData, abortSignal }: Options) => {
    onData(chunk);
    await new Promise<void>((_resolve, reject) => abortSignal!.addEventListener("abort", () => { released = true; reject(new DOMException("Stopped", "AbortError")); }, { once: true }));
  } };
  for await (const _ of streamCompletion(model, { messages: [], stream: true })) break;
  expect(released).toBe(true);
});

it("observes cancellation errors without leaving a rejected promise behind", async () => {
  const controller = new AbortController();
  const model = { createChatCompletion: async ({ onData, abortSignal }: Options) => {
    onData(chunk);
    await new Promise<void>((_resolve, reject) => abortSignal!.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError")), { once: true }));
  } };
  const stream = streamCompletion(model, { messages: [], stream: true, abortSignal: controller.signal });
  expect((await stream.next()).value).toBe(chunk);
  controller.abort();
  await expect(stream.next()).rejects.toMatchObject({ name: "AbortError" });
});
