# External browser-chat recipe

This directory maintains a Nimbus-format `registry:feature` recipe for the assistant-ui, wllama, and MCP chat feature. Its generated edition contains setup instructions, exact dependency versions from the lockfile, and 19 source/test files. It includes no model weights, WASM binaries, credentials, or copies of the reference submodules.

## Generate and use

```sh
npm run recipe:build
npm run recipe:check
```

The generator writes two static assets:

- `public/registry/features/browser-chat.md`: the self-contained recipe for a coding agent.
- `public/registry/registry.json`: its entry in Nimbus's registry index format.

The dev server serves them at `/registry/features/browser-chat.md` and `/registry/registry.json` (under the site's base path, if configured). Production builds include them too. `predev` and `prebuild` regenerate these files automatically.

To apply it to another site, give the generated Markdown file or its hosted URL to the coding agent working in that site's checkout, with this instruction:

> Read the browser-chat recipe and apply it to this Nimbus project, preserving its existing configuration, adapter, content, and styling. Run the validation steps and report the result.

To print the complete recipe without writing files:

```sh
npm run --silent recipe:print
```

To distribute it externally, upload the generated Markdown file to a static host or include it in a GitHub release. It is self-contained, so no source-file URLs or repository checkout are required by the consuming agent. Use a versioned URL or immutable release for repeatable installations. This project does not publish it automatically.

## Nimbus CLI limitation

Verified against the installed **Nimbus 0.19.2** CLI and the pinned reference source:

- `nimbus-docs add <slug> --print` checks the package's bundled index before fetching a recipe.
- A new slug such as `browser-chat` is rejected until that index includes it.
- `NIMBUS_REGISTRY_URL` changes the host for known entries; it does not load an external index or discover new names.
- `nimbus-docs add https://.../browser-chat.md` is not supported.
- `add source <url>` produces a content-loader guide; it does not install arbitrary feature recipes.

Therefore the generated index is a distribution artifact, not a claim that the stock CLI can register this feature. Use the agent handoff above today. Do not substitute this recipe for an unrelated built-in slug or patch an installed CLI to bypass discovery.

For official registry inclusion, the generated `browser-chat.md` can be proposed as `apps/www/registry/features/browser-chat.md` in Nimbus. Its JSON frontmatter matches the registry generator's format. Nimbus maintainers would review it, regenerate the index, and ship a CLI release that recognizes the name. Upstream registration and any new external-URL support are separate changes; the reference submodules remain unmodified here.

References: [registry documentation](https://nimbus-docs.com/registry/), [CLI documentation](https://nimbus-docs.com/cli/), [index lookup](../references/nimbus/packages/nimbus-docs/src/cli/resolver.ts), [feature name validation](../references/nimbus/packages/nimbus-docs/src/cli/index.ts).

## Maintain

Edit `registry/browser-chat.md` for installation guidance and edit the actual application files for implementation changes. `scripts/build-chat-recipe.mjs` embeds only an explicit list of files, so exports cannot accidentally absorb local environment files or unrelated site content. Dependency versions come from `package-lock.json`.

The generated files are ignored by Git. After editing the feature, regenerate the recipe and run `npm run recipe:check`. The unit tests parse the exported file blocks back into their original bytes; the browser test checks that the production server publishes the recipe and index. Existing chat tests continue to cover the exported implementation.
