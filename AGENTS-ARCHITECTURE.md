# OXOX Architecture Notes for Agents

This file expands the root `AGENTS.md` with the system map agents need before touching runtime, IPC, Droid SDK, renderer stores, or validation.

## Mental Model

OXOX has three layers:

1. **Renderer:** React UI and LegendApp stores. It renders sessions, composer state, command palette, sidebars, settings, and transcript views.
2. **Preload/shared contract:** A typed bridge that exposes safe methods/events to the renderer through `window.oxox`.
3. **Main process:** Electron lifecycle, windows, native integrations, database/search, Foundation service, live session management, daemon integration, and Droid SDK process transports.

The renderer requests work. The main process performs work. Shared contracts keep both sides aligned.

## Main Process Organization

`src/main/index.ts` boots Electron, creates the app window, initializes the application kernel, registers IPC, and starts runtime coordination.

Key areas:

- `src/main/app`: application kernel, service registry, plugin registry, local plugin host lifecycle.
- `src/main/ipc`: IPC route registration and renderer session attachment cleanup.
- `src/main/integration`: core application services:
  - `foundationService.ts`: top-level service boundary for renderer-facing data/actions.
  - `droid`: Droid CLI discovery/status.
  - `droidSdk`: SDK process factory and session transport.
  - `sessions`: live session process manager, event appliers, request resolution, snapshot conversion.
  - `daemon`: daemon WebSocket/JSON-RPC discovery and session controls.
  - `database`: SQLite persistence.
  - `artifacts`, `search`, `transcripts`: history, indexing, transcript loading.
- `src/main/windows`, `native`, `lifecycle`, `security`, `updater`, `diagnostics`: Electron shell concerns.

Main process code should be the only place that talks to Electron, Node-native APIs, SQLite, the daemon, or Droid processes.

## Droid SDK Flow

`@factory/droid-sdk` is linked from `../droid-sdk-typescript`.

The normal session path is:

1. Main process starts `FoundationService`.
2. `FoundationService` wires database, Droid CLI detection, daemon transport, live session runtime, session catalog/query/search, and session process management.
3. `createDroidSdkSessionFactory` builds a `DroidClient` backed by the SDK's `ProcessTransport`.
4. The SDK process transport launches Droid as:

   ```bash
   droid exec --input-format stream-jsonrpc --output-format stream-jsonrpc
   ```

5. `DroidSdkSessionTransport` initializes or loads sessions, sends user messages, handles permission/ask-user callbacks, lists tools/skills/MCP state, updates settings, and maps SDK notifications into OXOX session events.
6. `createSessionProcessManager` owns live session lifecycle: create, attach, detach, reconnect, interrupt, fork, compact, rewind, rename, and snapshot updates.

Important invariants:

- The streamed `droid exec` subprocess is the SDK transport mechanism, not a separate raw integration path.
- Let SDK `ProcessTransport` own its default exec arguments; OXOX should pass only app-specific options such as `cwd`, `env`, and `execPath` unless there is a deliberate SDK-supported override.
- Renderer code never creates SDK clients or spawns Droid. It uses IPC.
- Keep OXOX-specific Droid code as adapter code. Prefer SDK primitives and remove local protocol/session lifecycle code when the SDK provides an equivalent abstraction.

Current custom adapter surface:

- Electron-launched shells do not always inherit the user's interactive PATH, so OXOX resolves login-shell environment before constructing SDK `ProcessTransport`.
- OXOX persists session records/snapshots, handles renderer viewer attach/detach, and reconciles runtime state into SQLite/UI records.
- OXOX maps SDK/Droid notifications into app-specific transcript/session events.
- OXOX tracks renderer-facing permission and ask-user request state.
- OXOX has custom daemon catalog/status WebSocket code today; prefer SDK daemon APIs when they expose the equivalent list/status/normalization hooks OXOX needs.

## Renderer <> Main Communication

The bridge is intentionally explicit:

- `src/shared/ipc/contracts.ts` defines channel names, request/response payloads, event payloads, and the `OxoxBridge` shape.
- `src/preload/index.ts` exposes `window.oxox` through Electron `contextBridge`.
- `src/preload/bridge.ts` maps bridge methods to `ipcRenderer.invoke` and subscriptions to `ipcRenderer.on/off`.
- `src/main/ipc/router.ts` registers handlers and delegates to `FoundationService`, update services, plugin services, dialogs, and runtime info.
- Renderer feature code uses `createRendererPlatformApiClient`, `PlatformApiClient`, and `RootStore`.

When adding a bridge method or event, update all contract layers in the same change and add focused tests for the contract or behavior.

## Renderer Organization

The renderer app lives in `src/renderer/src`.

- `components`: UI grouped by feature area, including app shell, sidebar, transcript, composer, command palette, context panel, status bar, and shadcn-style `ui` primitives.
- `state`: LegendApp/stateful models. `RootStore` composes feature stores and shared event bus wiring.
- `platform`: bridge/API client abstraction and persistence ports.
- `hooks`: reusable renderer behavior.
- `lib`: shared renderer utilities.
- `diagnostics`: renderer-side performance/event logging helpers.

Prefer derived view models/selectors over pushing complex data shaping into presentational components.

## Store and Event Pattern

`RootStore` constructs the platform client boundary and feature stores. Stores should receive dependencies through constructors, not by importing global bridge state.

Common flow:

1. `StoreProvider` creates/provides `RootStore`.
2. Feature-connected components read stores.
3. Stores call `PlatformApiClient` methods.
4. Main process emits snapshots/events.
5. Foundation/live-session stores update UI state through store APIs and the event bus.

This keeps tests able to inject fake platform clients without Electron.

## Validation and Tooling

Primary validation commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

`pnpm release:validate` runs the same three checks in order. `pnpm lint` is intentionally two-stage:

1. `biome check .` for formatting/lint/import organization.
2. `oxlint . --deny-warnings` as an additional fast lint signal.

Use `pnpm check:fix` for Biome safe fixes. Use `pnpm format` only when you intend to write formatting changes. Use `pnpm format:check` when you only need verification.

Run `pnpm build` when changes touch Electron/Vite build config, preload/main bundling, packaging, native module setup, or production-only behavior.
