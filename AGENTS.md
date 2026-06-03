
# OXOX

OXOX is an open-source Electron desktop client for Factory AI's Droid. The product story is simple: the renderer gives users a polished chat/workspace UI, the main process owns the runtime and persistence, and Droid itself is driven through `@factory/droid-sdk`.

For deeper architecture notes, read [`AGENTS-ARCHITECTURE.md`](./AGENTS-ARCHITECTURE.md) before changing IPC, session runtime, Droid SDK integration, or store wiring.

## Technology Stack

- **Runtime shell:** Electron 41, `electron-vite`, Vite 7.
- **Language:** TypeScript 5.9, strict mode, ESM.
- **Renderer:** React 19, Tailwind CSS 4, shadcn/Radix-style primitives, Lucide icons, Framer Motion.
- **State:** LegendApp State stores composed through `RootStore`.
- **Droid integration:** `@factory/droid-sdk` linked from `../droid-sdk-typescript`.
- **Persistence/search:** `better-sqlite3`, local app persistence ports, `minisearch`.
- **Testing:** Vitest 4, Testing Library, jsdom for renderer/component tests.
- **Quality:** Biome for formatting/lint/import organization; Oxlint as an additional warning-free lint pass; `tsc --noEmit` for type safety.

## Codebase Map

- `src/main`: Electron main process. Owns app lifecycle, windows, native integration, IPC handlers, persistence, Droid runtime/session orchestration, daemon integration, updates, and diagnostics.
- `src/preload`: Secure bridge exposed with `contextBridge` as `window.oxox`. Keep Electron APIs here, not in the renderer.
- `src/renderer`: React UI. Components live under `src/renderer/src/components`; LegendApp stores live under `src/renderer/src/state`; bridge adapters live under `src/renderer/src/platform`.
- `src/shared`: Cross-process contracts: IPC channels, payload types, plugin contracts, shared search/design utilities.
- `build`, `scripts`, `package-mac-signed.sh`: packaging, release, signing, and metadata helpers.

## How the App Talks to Droid

The main process creates the Droid runtime through `@factory/droid-sdk`. `src/main/integration/droidSdk/factory.ts` configures the SDK's `ProcessTransport`, whose default subprocess protocol is:

```bash
droid exec --input-format stream-jsonrpc --output-format stream-jsonrpc
```

That command is not a separate hand-rolled integration; it is the SDK `ProcessTransport` default for speaking streamed JSON-RPC to Droid. OXOX should construct `ProcessTransport` without duplicating the SDK's default `execArgs`.

Reality check: OXOX uses SDK primitives for transport, `DroidClient`, session methods, notification conversion, schemas, and stream tracking. OXOX still has app adapter code for Electron-specific environment/PATH setup, renderer-facing permission/ask-user state, persistent session snapshots, viewer attach/detach, DB/runtime reconciliation, derived-session attachment after fork/rewind/compact, and app-specific event mapping. Keep that adapter code honest and small: if `droid-sdk-typescript` exposes an equivalent capability, prefer deleting local code and delegating to the SDK.

Renderer code should never spawn Droid directly; it asks the main process through the typed bridge.

## Renderer <> Main Process Contract

The contract flow is:

1. Define shared channel/types in `src/shared/ipc/contracts.ts`.
2. Expose preload methods in `src/preload/bridge.ts`.
3. Register main handlers in `src/main/ipc/router.ts`.
4. Consume through `PlatformApiClient` and `RootStore` in the renderer.

Do not call raw `window.oxox` from feature code unless you are at renderer bootstrap or test setup. Prefer injected platform clients and stores so behavior stays testable.

## Development Rules

- Start with existing patterns. Check nearby files before introducing new APIs, state shape, naming, or UI conventions.
- Keep main-process side effects in `src/main`; keep renderer code declarative and bridge-driven.
- Prefer `@factory/droid-sdk` primitives over custom Droid protocol/session code. If the SDK exposes a capability, use it instead of duplicating transport, protocol parsing, or session lifecycle behavior locally.
- When adding IPC, update the shared contract, preload bridge, main router, and tests together.
- When changing session/runtime behavior, inspect the relevant integration tests under `src/main/integration/__tests__` and session tests under `src/main/integration/sessions/__tests__`.
- Keep tests focused on behavior, business logic, contracts, and regressions. For UI, test user-visible behavior rather than styling details unless the visual behavior is the feature.
- Only modify files directly related to the task. If you notice unrelated cleanup, mention it instead of doing it.

## Validation

Run validators before handing off code changes:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Useful commands:

- `pnpm lint` runs `pnpm lint:biome && pnpm lint:ox`.
- `pnpm lint:biome` runs `biome check .`.
- `pnpm lint:ox` runs `oxlint . --deny-warnings`.
- `pnpm typecheck` runs `tsc --noEmit`.
- `pnpm test` runs `vitest run`.
- `pnpm release:validate` runs lint, typecheck, and tests.
- `pnpm check:fix` runs `biome check . --write` for safe fixes/import organization.
- `pnpm format` writes Biome formatting.
- `pnpm format:check` checks formatting without writing.
- `pnpm build` runs the Electron/Vite production build; use it when packaging/build behavior is affected.

Known test stderr that may appear while the suite still passes: `ResizeObserver is not defined` from `@pierre/diffs`, and React `act(...)` warnings from tooltip interactions.

## Knowledge Collection

- Use Context7 MCP for up-to-date library/framework docs when available.
- Use web search for current external facts.
- A local copy of `droid-sdk-typescript` is available at `../droid-sdk-typescript`; inspect it when SDK behavior or types are unclear.

## Output Guidelines

Start every response with the actual answer. No preamble, no filler, no restating the question.

Match depth to the task. Simple questions get direct answers; complex engineering work gets enough context to be actionable.

If uncertain about a fact, say so before using it. Do not invent plausible details.
