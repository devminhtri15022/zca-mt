# Changelog

All notable changes to ZCA-MT are documented in this file.

This project is a fork of [zca-js](https://github.com/RFS-ADRENO/zca-js).
Entries below only describe changes made **in this fork**; see the upstream
project's own history for changes to the underlying protocol implementation
this fork was built from.

## [0.1.0] - Unreleased

Initial release of ZCA-MT, forked from `zca-js`.

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
  before being printed by ZCA-MT's internal logger.
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
  of this fork. ZCA-MT does not add new Zalo API endpoints of its own.
