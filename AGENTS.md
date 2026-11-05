# Nimbus browser chat

Read [AGENT.md](./AGENT.md) for Nimbus authoring and project conventions.

## Reference sources

- `references/nimbus` is the pinned https://github.com/cloudflare/nimbus submodule.
- `references/wllama` is the pinned https://github.com/ngxson/wllama submodule.
- Use https://nimbus-docs.com as the Nimbus documentation source; its index is https://nimbus-docs.com/llms.txt.
- Use assistant-ui for the chat surface: https://github.com/assistant-ui/assistant-ui and https://www.assistant-ui.com/docs.
- Consult these sources before changing integrations. Keep submodules unmodified unless the task specifically requires upstream work.
- Check installed package types too: the reference branch may be newer than the npm release.

## Chat invariants

- Inference and model weights stay in the browser. No hosted inference or API keys.
- Download weights only after a submitted prompt and explicit consent for that model.
- Reuse only complete cached models; missing or evicted files require new consent.
- MCP uses this site's same-origin `/mcp` endpoint and only its read-only `list_pages` and `get_page` tools.
- Keep cancellation, streaming, thinking, and tool execution bounded and observable.
- Enable wllama's Jinja templates for Qwen tool calling and thinking controls. Retrieve an initial page through MCP before generating an answer; small models can otherwise skip tool calls.
- Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e` for integration changes.

## External feature recipe

- `registry/browser-chat.md` contains the installation guidance; `scripts/build-chat-recipe.mjs` embeds the live feature code and locked dependency versions into `public/registry/features/browser-chat.md`.
- Keep the export file list explicit. Do not include environment files, model weights, WASM binaries, or unrelated site files.
- Regenerate with `npm run recipe:build` and verify with `npm run recipe:check` after feature changes. Generated registry assets are ignored by Git.
- Nimbus 0.19.2 resolves names from its bundled index. Do not claim arbitrary recipe URLs or new external slugs work with its stock CLI; use the direct agent handoff documented in `registry/README.md`.
