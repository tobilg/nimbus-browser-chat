# Nimbus local chat

A local Nimbus documentation site with an Astro React island at `/chat`. The interface uses [assistant-ui](https://github.com/assistant-ui/assistant-ui); [wllama](https://github.com/ngxson/wllama) runs Qwen3.5 in a browser worker and the MCP client reads this site's documentation.

## Run locally

Requires Node.js 22.12 or later. From this directory:

```sh
npm install
npm run dev
```

Open **http://localhost:4321/chat**. Add your documentation in `src/content/docs/`; Nimbus exposes it automatically through `/mcp`.

For a production build served locally:

```sh
npm run build
HOST=127.0.0.1 PORT=4321 npm start
```

Stop the dev server before starting production on the same port. Astro 7 may run its dev server in the background in agent environments; `npm run dev -- stop` stops that server.

Set `SITE_URL` when building for a different origin. It defaults to `http://localhost:4321`. This project uses the Node adapter and requires no Cloudflare account, hosted inference API, or API key.

## Models and downloads

| Model | Quantization | Weight download |
| --- | --- | --- |
| Qwen3.5 0.8B | Q4_K_M | 532,517,120 bytes (533 MB) |
| Qwen3.5 2B | Q4_K_M | 1,280,835,840 bytes (1.28 GB) |

The models are text-only GGUF quantizations from [Unsloth's 0.8B repository](https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF) and [2B repository](https://huggingface.co/unsloth/Qwen3.5-2B-GGUF). Exact revision URLs and file sizes are pinned in `src/lib/chat/models.ts`. No vision projector is downloaded.

- Opening the page or selecting a model never downloads weights or WASM.
- The first submitted prompt asks for approval before downloading missing weights.
- Complete cached weights are reused on later prompts and reloads. Eviction or incomplete downloads require consent again.
- WASM and compatibility assets are copied from the pinned npm packages into ignored `public/wasm/` by `postinstall` and served locally.
- One model stays in memory at a time. Cached models can be removed below the composer.
- Thinking uses Qwen's `enable_thinking` template setting, with reasoning shown separately.
- Stop cancels download, MCP, and generation work. WASM model initialization cannot be interrupted mid-load; cancellation is observed immediately afterward.
- Downloads time out after one minute without progress and can be retried.

Use a recent desktop browser on localhost or HTTPS. Chrome or Edge is recommended for the first run. WebGPU is used when available; wllama also supports CPU inference and its compatibility runtime. Available memory, browser storage quotas, and GPU drivers affect model support and speed. Private windows can impose smaller quotas; use a regular window for 2B. Model memory needs exceed the file size. The project serves COOP/COEP headers for multithreading; preserve them behind a reverse proxy.

## Runtime and privacy

`src/components/chat/Chat.tsx` implements the assistant-ui `ChatModelAdapter`. `src/lib/chat/browser-runtime.ts` owns lazy loading, cache consent, and model lifecycle. `src/lib/chat/agent.ts` streams responses and runs the bounded tool loop. `src/lib/chat/mcp.ts` uses the official MCP SDK's Streamable HTTP client.

The client discovers and allows only Nimbus's read-only `list_pages` and `get_page` tools. Each turn lists pages, ranks their titles, URLs, and descriptions against the question, and reads the best match through MCP before generating. This provides page content even when a small model skips tool calls. Further reads can be chosen by the model through the tool loop. Tool results are returned to the model and displayed as lookup activity. History, tool results, tool iterations, and output tokens have limits to fit an 8,192-token browser context; especially long or multilingual conversations may still need a new chat. Initial ranking covers the first catalog page (up to 200 documents); the model can use `list_pages` cursors for further discovery.

Inference stays on the device. Hugging Face receives model-download requests; this site's MCP server receives documentation lookup arguments. Messages are held in tab memory, without conversation persistence. Markdown uses a safe React renderer, and generated images are disabled. Small models can answer incorrectly or omit sources: verify claims against the documents.

## References for future work

The Git submodules are pinned references, separate from npm runtime dependencies:

- `references/nimbus`: https://github.com/cloudflare/nimbus
- `references/wllama`: https://github.com/ngxson/wllama
- Nimbus documentation: https://nimbus-docs.com, with an agent index at https://nimbus-docs.com/llms.txt

After cloning this project, initialize these references with:

```sh
git submodule update --init
```

The main branch of a reference can be ahead of the published package. The app currently pins Nimbus 0.19.2 and wllama 3.8.1; consult installed types as well as the references. `AGENTS.md` records these conventions, and `AGENT.md` contains Nimbus's starter guidance.

## Checks

```sh
npm run typecheck
npm test
npm run build
npm run check
npm run test:e2e
```

If Playwright's Chromium is missing, install it with `npx playwright install chromium`. The normal suite tests consent, error recovery, mobile layout, isolation headers, and the real Nimbus MCP endpoint without downloading weights. Unit tests cover streaming, fragmented tool calls, limits, cache reuse, and cancellation.

Opt into real model tests (approximately 1.81 GB of downloads in temporary browser profiles):

```sh
npm run build
NIMBUS_REAL_MODELS=1 NIMBUS_TEST_PRODUCTION=1 NIMBUS_TEST_PORT=4322 npm run test:e2e -- tests/e2e/models.spec.ts --workers=1
```

These test actual model loading, streamed responses, document tool calls, thinking, cancellation, and cache reuse after reload. Use a separate port for production tests if the dev server is running. Avoid running builds against a live dev server's dependency cache during browser tests.
