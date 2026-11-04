import type { LocalModel } from "./models";

export type DownloadConsent = (model: LocalModel, signal: AbortSignal) => Promise<boolean>;
export interface CachedModel {
  url: string;
  size: number;
}
export interface ModelStore<T extends CachedModel> {
  getModels(): Promise<T[]>;
  downloadModel(url: string, options: { signal: AbortSignal; progressCallback: (progress: { loaded: number; total: number }) => void }): Promise<T>;
}

// Never let a cache miss silently become a network download.
export async function obtainModel<T extends CachedModel>(
  store: ModelStore<T>, model: LocalModel, consent: DownloadConsent,
  signal: AbortSignal, progressCallback: (progress: { loaded: number; total: number }) => void,
): Promise<T> {
  signal.throwIfAborted();
  const cached = (await store.getModels()).find(item => item.url === model.url && item.size === model.bytes);
  signal.throwIfAborted();
  if (cached) return cached;
  if (!await consent(model, signal)) throw new DOMException("Model download cancelled.", "AbortError");
  signal.throwIfAborted();
  const timeout = new AbortController();
  const downloadSignal = AbortSignal.any([signal, timeout.signal]);
  let timer: ReturnType<typeof setTimeout>;
  const resetTimeout = () => {
    clearTimeout(timer);
    timer = setTimeout(() => timeout.abort(new Error("The model download stalled. Check your connection and retry the response.")), 60_000);
  };
  resetTimeout();
  let onAbort: () => void = () => {};
  try {
    const download = store.downloadModel(model.url, {
      signal: downloadSignal,
      progressCallback: progress => {
        if (downloadSignal.aborted) return;
        resetTimeout();
        progressCallback(progress);
      },
    });
    // wllama's preliminary metadata requests do not all accept a signal.
    const cancelled = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(downloadSignal.reason);
      downloadSignal.addEventListener("abort", onAbort, { once: true });
      if (downloadSignal.aborted) onAbort();
    });
    const downloaded = await Promise.race([download, cancelled]);
    signal.throwIfAborted();
    if (downloaded.size !== model.bytes) throw new Error("The model download is incomplete. Please retry.");
    return downloaded;
  } finally {
    clearTimeout(timer!);
    downloadSignal.removeEventListener("abort", onAbort);
  }
}
