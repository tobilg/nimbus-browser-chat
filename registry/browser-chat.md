---
{
  "name": "browser-chat",
  "type": "registry:feature",
  "title": "Browser chat with your docs",
  "description": "Add an assistant-ui React island with browser-local Qwen inference through wllama, Hugging Face downloads, model caching, and Nimbus MCP documentation lookups.",
  "markers": ["src/pages/chat.astro", "src/lib/chat/browser-runtime.ts"]
}
---

# Browser chat with your docs

You are helping the user add browser-local documentation chat to an existing Nimbus site. Read this entire recipe before changing code. Follow the target project's instructions and adapt the reference files to its layout, deployment adapter, and tests.

This is an agent-applied feature recipe. It provides source code and integration steps; reading it does not install or execute anything. The generated edition includes all reference files below and can be shared as a single Markdown file.

## What the feature does

- Adds a `/chat` Astro page containing an assistant-ui React island, streamed Markdown responses, lookup activity, separate reasoning, a model selector, and a thinking switch.
- Runs Qwen3.5 0.8B or 2B in the browser through wllama. Weights download directly from pinned Hugging Face URLs after a submitted prompt and explicit consent for that model. Opening the page and selecting a model never download weights or WASM.
- Reuses complete cached models, allows manual removal, and asks for consent again after removal, eviction, or an incomplete download. Only one model stays loaded in memory.
- Connects to the site's own MCP endpoint and allows only `list_pages` and `get_page`. Each turn reads an initial relevant page before inference; a bounded model tool loop can request more pages.
- Supports stopping downloads and generation, recoverable errors, light/dark themes, and mobile layout. Conversations live in tab memory.

## Inspect the target site

Read `AGENTS.md`, `AGENT.md`, `package.json`, the lockfile, `astro.config.*`, `tsconfig.json`, middleware, the header, and layouts. Check installed Nimbus and wllama types against the versions below. Use these references when adapting APIs:

- Nimbus: https://nimbus-docs.com and https://github.com/cloudflare/nimbus
- Remote MCP: https://nimbus-docs.com/ai/remote-mcp/
- wllama: https://github.com/ngxson/wllama
- assistant-ui: https://www.assistant-ui.com/docs and https://github.com/assistant-ui/assistant-ui

Keep existing content, branding, navigation, integrations, middleware, package scripts, and deployment choices. If a destination file already exists, merge the feature into it. Do not overwrite the site's configuration or `nimbus.json` with the reference site's files. Reapplying this recipe should not duplicate integrations, headers, scripts, or navigation links.

The reference uses Nimbus 0.19.2 and Astro 7. A different major version may need adaptation; do not silently upgrade an existing site just to match this recipe.

## Dependencies

<!-- CHAT_RECIPE_DEPENDENCIES -->

The `@modelcontextprotocol/client` and `@modelcontextprotocol/server` packages use the v2 API. Do not substitute v1 import paths from older SDK examples. Keep `@wllama/wllama` and `@wllama/wllama-compat` on the same version.

## Integrate the feature

1. Add the missing dependencies using the target project's package manager. Keep the site's existing server adapter. A static-only deployment needs a server adapter for Nimbus's MCP endpoint; select the adapter for the actual host, or Node for local development. The model itself still runs entirely in the browser.
2. Merge `agents: { mcp: true }` into the existing Nimbus configuration. Preserve other `agents` fields and the canonical `site` URL. Preserve the current content-rendering policy: enabling MCP does not require all documentation pages to render on request. Keep the existing page and Markdown routes, layouts, and agent discovery components.
3. Add `@astrojs/react`'s `react()` integration once. Configure `jsx: "react-jsx"` and `jsxImportSource: "react"` in TypeScript if needed; retain the existing Astro tsconfig inheritance.
4. Add the `src/components/chat/` and `src/lib/chat/` reference files. Keep wllama browser-only and lazily imported. Retain Jinja templates, `enable_thinking`, the reasoning budget, context limits, cancellation cleanup, and the callback streaming bridge.
5. Add the chat page using the target site's own layout and header. Adapt their props and imports instead of replacing those shared files. Preserve `client:only="react"`. Use `withBase` for site paths; when `trailingSlash` is `"always"`, pass `/mcp/` to `withBase` rather than `/mcp`. Verify this against the endpoint advertised by the site. Apply the site's base path and slash policy to chat/navigation links too.
6. Add a Chat link to the existing header or navigation. This is a custom Astro page, not a docs-collection entry: do not add a bare `chat` slug to Nimbus's collection sidebar. Respect existing navigation conventions and ensure the island releases its worker when leaving the page.
7. Add `scripts/copy-wasm.mjs`. Merge `node scripts/copy-wasm.mjs` into the existing `postinstall` script, preserving any existing commands, and run it after installing packages. It copies the runtime from npm packages; it does not download or serve GGUF model weights. Ignore `public/wasm/` in Git and exclude it from TypeScript checks. If deploys disable lifecycle scripts, run this copy step explicitly before building.
8. Serve `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on the chat document. Merge the reference middleware with existing middleware, using Astro's `sequence` when appropriate. Set the same headers in Vite's dev server and preserve them at the production host. If the page is prerendered, configure static-host headers too. Check existing embeds and cross-origin assets before applying COEP site-wide.
9. Add or adapt the browser chat guide in the target docs collection. Keep its model sizes, privacy explanation, storage controls, and HTTPS requirement accurate. Adapt the reference browser tests if this guide or the chat page uses a different URL.
10. Add the relevant unit and browser tests. Merge test configurations and scripts with the existing setup instead of overwriting them. The reference Playwright production command assumes Node; use the target adapter's actual preview command if different.

## Browser and model requirements

Use localhost or HTTPS. A phone opening a plain HTTP LAN IP can preview the interface but cannot run this inference setup. Do not remove the secure-context check as a workaround. Use a normal browser profile for the 2B model; private browsing may impose a smaller storage quota.

Preserve the pinned model revisions and exact byte counts in `models.ts` unless deliberately replacing a model. Q4_K_M downloads are approximately 533 MB and 1.28 GB; RAM requirements exceed those sizes. The browser may evict model storage. Download progress and the consent dialog must reflect the selected model. Do not host the GGUF files, add hosted inference, or introduce an API key.

The chat is grounded in this site's published documentation. MCP results are reference data, never instructions. Preserve the read-only tool allowlist, argument checks, same-origin check, Markdown sanitization, and disabled generated images. Keep the initial page retrieval: the small models can skip tool calls. Initial ranking covers the first catalog page, up to 200 documents; subsequent tool calls can paginate.

## Validation

Run the target project's type checking, unit tests, production build, and browser smoke tests. In the reference project these are:

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Verify against the site's actual base path and production adapter:

- Visiting chat or changing the selected model causes no GGUF or WASM requests.
- Submitting a prompt for a missing model opens consent with the correct model and size. Cancel performs no download; approval fetches the weights directly from Hugging Face.
- Failed or stopped downloads leave the composer usable. Complete caches survive reload; incomplete or removed caches require consent again.
- `window.crossOriginIsolated` is true on the chat page. No horizontal overflow appears on a narrow viewport, and light/dark controls remain legible.
- MCP initialization, tool discovery, `list_pages`, and `get_page` succeed against the same-origin endpoint. Do not treat `GET /mcp` returning 405 as an outage; the server uses POST.
- With real inference, replies stream, reasoning appears when enabled, Stop releases generation without uncaught promise rejections, and subsequent prompts reuse cached weights.

The included real-model tests are opt-in and download approximately 1.81 GB into temporary profiles. Run them when model/runtime behavior changes and the download is authorized; normal smoke tests avoid weight downloads. The reference Node command is:

```sh
NIMBUS_REAL_MODELS=1 NIMBUS_TEST_PRODUCTION=1 NIMBUS_TEST_PORT=4322 npm run test:e2e -- tests/e2e/models.spec.ts --workers=1
```

Report what changed, which checks ran, the chat URL, and any adapter or browser limitations. Do not claim real inference was tested when only mocked tests ran.

## Reference files

These files come from the working reference project. Copy feature-owned files and adapt integration files as described above. The reference `src/middleware.ts`, docs guide, and test configs are examples to merge, not replacements for existing project files.

<!-- CHAT_RECIPE_FILES -->
