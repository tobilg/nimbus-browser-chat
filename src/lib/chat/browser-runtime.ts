import type { ChatCompletionMessage, ModelManager, Wllama } from "@wllama/wllama";
import { MODELS, type LocalModel } from "./models";
import { obtainModel, type DownloadConsent } from "./model-cache";
import { connectDocumentation } from "./mcp";
import { runDocumentationAgent, type GenerationSnapshot } from "./agent";
import { streamCompletion } from "./inference-stream";

export interface RuntimeStatus {
  phase: "idle" | "checking" | "downloading" | "loading" | "connecting" | "generating";
  loaded?: number;
  total?: number;
}

export class BrowserChatRuntime {
  private manager?: ModelManager;
  private wllama?: Wllama;
  private loadedModel?: string;
  private controller?: AbortController;
  private completion?: Promise<void>;
  private disposed = false;

  private async getManager(): Promise<ModelManager> {
    if (!this.manager) {
      const { ModelManager } = await import("@wllama/wllama");
      this.manager = new ModelManager({ allowOffline: true });
    }
    return this.manager;
  }

  async cachedModels(): Promise<string[]> {
    const cached = await (await this.getManager()).getModels();
    return MODELS.filter(model => cached.some(item => item.url === model.url && item.size === model.bytes)).map(model => model.id);
  }

  async removeModel(model: LocalModel): Promise<void> {
    if (this.controller) throw new Error("Stop the current response before removing a model.");
    if (this.loadedModel === model.id) {
      await this.wllama?.exit();
      this.wllama = undefined;
      this.loadedModel = undefined;
    }
    const cached = await (await this.getManager()).getModels();
    for (const item of cached.filter(item => item.url === model.url)) await item.remove();
  }

  async *reply(options: {
    model: LocalModel; thinking: boolean; history: ChatCompletionMessage[];
    endpoint: string; consent: DownloadConsent; signal: AbortSignal;
    onStatus: (status: RuntimeStatus) => void;
  }): AsyncGenerator<GenerationSnapshot> {
    if (this.disposed) throw new Error("This chat has closed. Reload the page.");
    if (this.controller) throw new Error("The previous response is still stopping. Please try again.");
    const controller = new AbortController();
    this.controller = controller;
    let complete!: () => void;
    this.completion = new Promise(resolve => { complete = resolve; });
    const signal = AbortSignal.any([options.signal, controller.signal]);
    let mcp: Awaited<ReturnType<typeof connectDocumentation>> | undefined;
    try {
      if (!window.isSecureContext) throw new Error("Browser inference requires HTTPS or localhost.");
      if (!navigator.storage || !globalThis.caches) throw new Error("Browser model storage is unavailable. Try a regular browser window.");
      const endpoint = new URL(options.endpoint, window.location.href);
      if (endpoint.origin !== location.origin) throw new Error("The documentation endpoint must be on this site's origin.");
      const latest = options.history.at(-1)?.content;
      if (typeof latest !== "string" || !latest.trim()) throw new Error("Enter a question to start chatting.");
      if (latest.length > 4_000) throw new Error("Please keep your message under 4,000 characters.");

      if (this.loadedModel !== options.model.id) {
        options.onStatus({ phase: "checking" });
        const manager = await this.getManager();
        const model = await obtainModel(manager, options.model, async (definition, consentSignal) => {
          const accepted = await options.consent(definition, consentSignal);
          if (!accepted) return false;
          const estimate = await navigator.storage.estimate();
          if (estimate.quota && estimate.quota - (estimate.usage ?? 0) < definition.bytes * 1.05) {
            throw new Error("There is not enough browser storage for this model. Free some space or select the smaller model.");
          }
          await navigator.storage.persist?.().catch(() => false);
          options.onStatus({ phase: "downloading", loaded: 0, total: definition.bytes });
          return true;
        }, signal, progress => options.onStatus({ phase: "downloading", ...progress }));
        signal.throwIfAborted();
        options.onStatus({ phase: "loading" });
        await this.wllama?.exit();
        this.wllama = undefined;
        this.loadedModel = undefined;
        const { Wllama, LoggerWithoutDebug } = await import("@wllama/wllama");
        const assets = new URL(`${import.meta.env.BASE_URL}wasm/`, location.origin);
        const instance = new Wllama({ default: new URL("wllama.wasm", assets).href }, { modelManager: manager, logger: LoggerWithoutDebug, suppressNativeLog: true, allowOffline: true });
        instance.setCompat({ wasm: new URL("wllama-compat.wasm", assets).href, worker: new URL("wllama-compat.js", assets).href }, "firefox_safari");
        this.wllama = instance;
        try {
          await instance.loadModel(model, {
            n_ctx: 8192, n_batch: 128, n_ubatch: 64, n_parallel: 1,
            n_threads: crossOriginIsolated ? Math.max(1, Math.min(4, Math.floor(navigator.hardwareConcurrency / 2))) : 1,
            jinja: true, reasoning: true, reasoning_format: "deepseek", reasoning_budget_tokens: 512,
          });
          signal.throwIfAborted();
          this.loadedModel = options.model.id;
        } catch (error) {
          await instance.exit().catch(() => {});
          this.wllama = undefined;
          throw error;
        }
      }
      signal.throwIfAborted();
      options.onStatus({ phase: "connecting" });
      mcp = await connectDocumentation(endpoint, signal);
      options.onStatus({ phase: "generating" });
      yield* runDocumentationAgent({ createChatCompletion: async params => streamCompletion(this.wllama!, params) }, mcp, options.history, options.thinking, signal);
    } finally {
      await mcp?.close().catch(() => {});
      this.controller = undefined;
      options.onStatus({ phase: "idle" });
      complete();
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.controller?.abort();
    await this.completion;
    await this.wllama?.exit().catch(() => {});
    this.wllama = undefined;
  }
}
