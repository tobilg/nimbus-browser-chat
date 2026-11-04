import { describe, expect, it, vi } from "vitest";
import { obtainModel } from "../../src/lib/chat/model-cache";
import { MODELS } from "../../src/lib/chat/models";

const model = MODELS[0]!;
const cachedModel = { url: model.url, size: model.bytes };
function store(entries = [cachedModel]) {
  return { getModels: vi.fn().mockResolvedValue(entries), downloadModel: vi.fn().mockResolvedValue(cachedModel) };
}

describe("model download consent", () => {
  it("reuses complete cached weights without consent or network", async () => {
    const cache = store(); const consent = vi.fn();
    expect(await obtainModel(cache, model, consent, new AbortController().signal, vi.fn())).toBe(cachedModel);
    expect(consent).not.toHaveBeenCalled(); expect(cache.downloadModel).not.toHaveBeenCalled();
  });
  it("does not start a download while consent is pending", async () => {
    const cache = store([]); let approve!: (value: boolean) => void;
    const pending = obtainModel(cache, model, () => new Promise(resolve => { approve = resolve; }), new AbortController().signal, vi.fn());
    await vi.waitFor(() => expect(approve).toBeTypeOf("function"));
    expect(cache.downloadModel).not.toHaveBeenCalled();
    approve(true); await pending; expect(cache.downloadModel).toHaveBeenCalledOnce();
  });
  it("never downloads after declining", async () => {
    const cache = store([]);
    await expect(obtainModel(cache, model, async () => false, new AbortController().signal, vi.fn())).rejects.toMatchObject({ name: "AbortError" });
    expect(cache.downloadModel).not.toHaveBeenCalled();
  });
  it("asks again for incomplete or evicted weights", async () => {
    for (const entries of [[], [{ ...cachedModel, size: model.bytes - 1 }]]) {
      const consent = vi.fn().mockResolvedValue(true); const cache = store(entries);
      await obtainModel(cache, model, consent, new AbortController().signal, vi.fn());
      expect(consent).toHaveBeenCalledOnce(); expect(cache.downloadModel).toHaveBeenCalledOnce();
    }
  });
  it("stops between approval and download when cancelled", async () => {
    const cache = store([]); const controller = new AbortController();
    await expect(obtainModel(cache, model, async () => { controller.abort(); return true; }, controller.signal, vi.fn())).rejects.toMatchObject({ name: "AbortError" });
    expect(cache.downloadModel).not.toHaveBeenCalled();
  });
  it("rejects an incomplete download", async () => {
    const cache = store([]); cache.downloadModel.mockResolvedValue({ ...cachedModel, size: 100 });
    await expect(obtainModel(cache, model, async () => true, new AbortController().signal, vi.fn())).rejects.toThrow("incomplete");
  });
  it("recovers when a download stops making progress", async () => {
    vi.useFakeTimers();
    try {
      const cache = store([]); cache.downloadModel.mockImplementation(() => new Promise(() => {}));
      const pending = obtainModel(cache, model, async () => true, new AbortController().signal, vi.fn());
      const rejection = expect(pending).rejects.toThrow("stalled");
      await vi.advanceTimersByTimeAsync(60_001);
      await rejection;
      expect(cache.downloadModel.mock.calls[0]![1].signal.aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it("cancels even when a metadata request ignores the abort signal", async () => {
    const cache = store([]); cache.downloadModel.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const pending = obtainModel(cache, model, async () => true, controller.signal, vi.fn());
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(cache.downloadModel).toHaveBeenCalled());
    controller.abort(); await rejection;
  });
});
