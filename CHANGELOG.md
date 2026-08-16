# Changelog

## 1.2.1

- Standardized all current product-facing names and messages to lowercase `zca-mt`.
- Kept `ZcaMT` and `ZCA_MT_*` only where required by TypeScript and environment-variable syntax.
- Preserved historical `zca-js` attribution and migration references.

## 1.2.0

- Added websocket handshake timeout, silence detection and stable-connection retry reset.
- Made asynchronous rate limiting strictly FIFO and added global bot budgets plus idle cleanup.
- Added AES-256-GCM encrypted session files and asynchronous session APIs.
- Added an abortable retry helper restricted to explicitly idempotent operations.
- Added focused tests and automated dependency/security scanning.

## 1.1.0

- Added observable listener lifecycle and reconnect jitter with bounded delays.
- Added abortable async rate-limit queues and runtime snapshots.
- Hardened session persistence with atomic writes, size limits and symlink checks.
- Added a typed, per-thread rate-limited `CommandRouter` for bot projects.
- Added cross-platform Node.js 20/22 CI and package verification.

All notable changes to zca-mt are documented in this file.

This project is a fork of [zca-js](https://github.com/RFS-ADRENO/zca-js).
Entries below only describe changes made **in this fork**; see the upstream
project's own history for changes to the underlying protocol implementation
this fork was built from.

## [0.1.0] - Unreleased

Initial release of zca-mt, forked from `zca-js`.

### Added

- `ZcaMT` class as the preferred entry point (`import { ZcaMT } from "zca-mt"`),
  implemented as an unmodified subclass of the original `Zalo` class.
- `Zalo` export kept as a backward-compatible alias for `ZcaMT`.
- New error hierarchy: `ZcaMTError`, `AuthenticationError`, `SessionError`,
  `NetworkError`, `ApiError`, `ListenerError`, `ValidationError`,
  `RateLimitError`, each carrying `{ code, message, cause?, retryable? }`.
  These are additive — the original `ZaloApiError` and related classes from
  `zca-js` are still exported unchanged.
- Logger redaction: `cookie`, `token`, `imei`, `secret`, `authorization`,
  and `session`-named fields (case-insensitive, substring match) are masked
  before being printed by zca-mt's internal logger.
- Optional session helpers (`saveSession`, `loadSession`, `deleteSession`)
  for persisting login credentials to disk with restrictive file
  permissions. Not called automatically — session persistence remains fully
  opt-in.
- Optional `RateLimiter` class for throttling outgoing actions (e.g.
  `sendMessage`) in your own bot code.
- Optional `withImageMetadataValidation` wrapper for `imageMetadataGetter`
  implementations, to fail fast on missing/invalid width, height, or size.
- Rebranded package metadata, README, examples (`login-qr.ts`,
  `listen-message.ts`, `send-message.ts`, `basic-bot.ts`), and an automated
  `vitest` test suite that runs without any real network access or login.

### Changed

- Package name: `zca-js` → `zca-mt`.
- Build `prebuild` script now runs with `node` instead of `bun` (the script
  itself only used Node-standard APIs, so no behavior change).
- `engines.node` raised to `>=20.0.0`.

### Unchanged (inherited as-is from zca-js)

- All request/response shapes under `src/apis/`.
- The realtime `Listener` implementation and its event names/payloads.
- Login flow (`login`, `loginQR`) and its internal cookie/context handling.
- Models under `src/models/` and enums under `src/models/Enum.ts`.

### Not supported

- Anything not already present in the upstream `zca-js` project at the time
  of this fork. zca-mt does not add new Zalo API endpoints of its own.
