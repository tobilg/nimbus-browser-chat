import type { ChatCompletionChunk, ChatCompletionParams } from "@wllama/wllama";

interface CallbackInference {
  createChatCompletion(options: ChatCompletionParams & { stream: true; onData: (chunk: ChatCompletionChunk) => void }): Promise<void>;
}

// Use the callback API so cancellation cannot strand wllama's iterator promises.
export async function* streamCompletion(model: CallbackInference, options: ChatCompletionParams & { stream: true }): AsyncGenerator<ChatCompletionChunk> {
  const controller = new AbortController();
  const signal = options.abortSignal ? AbortSignal.any([options.abortSignal, controller.signal]) : controller.signal;
  const queue: ChatCompletionChunk[] = [];
  let done = false;
  let failure: unknown;
  let wake: (() => void) | undefined;
  const finished = model.createChatCompletion({
    ...options, abortSignal: signal,
    onData: chunk => { if (!signal.aborted) queue.push(chunk); wake?.(); },
  }).then(
    () => { done = true; wake?.(); },
    error => { failure = error; done = true; wake?.(); },
  );
  try {
    while (!done || queue.length) {
      if (signal.aborted) queue.length = 0;
      const chunk = queue.shift();
      if (chunk) yield chunk;
      else if (!done) await new Promise<void>(resolve => { wake = resolve; });
    }
    if (failure) throw failure;
    signal.throwIfAborted();
  } finally {
    controller.abort();
    await finished;
  }
}
