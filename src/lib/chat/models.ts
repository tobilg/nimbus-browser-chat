export interface LocalModel {
  id: string;
  name: string;
  description: string;
  bytes: number;
  url: string;
  source: string;
}

export const MODELS: readonly LocalModel[] = [
  {
    id: "qwen3.5-0.8b",
    name: "Qwen3.5 0.8B",
    description: "Smaller download, quicker responses",
    bytes: 532_517_120,
    source: "https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF",
    url: "https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/6ab461498e2023f6e3c1baea90a8f0fe38ab64d0/Qwen3.5-0.8B-Q4_K_M.gguf",
  },
  {
    id: "qwen3.5-2b",
    name: "Qwen3.5 2B",
    description: "More capable, uses more memory",
    bytes: 1_280_835_840,
    source: "https://huggingface.co/unsloth/Qwen3.5-2B-GGUF",
    url: "https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/f6d5376be1edb4d416d56da11e5397a961aca8ae/Qwen3.5-2B-Q4_K_M.gguf",
  },
];

export function formatBytes(bytes: number): string {
  return bytes >= 1_000_000_000 ? `${(bytes / 1_000_000_000).toFixed(2)} GB` : `${Math.ceil(bytes / 1_000_000)} MB`;
}
