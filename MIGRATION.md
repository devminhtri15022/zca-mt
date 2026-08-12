# Migrating from `zca-js` to `zca-mt`

This guide covers moving an existing `zca-js` project to `zca-mt`.

## 1. Install

```bash
npm uninstall zca-js
npm install zca-mt
```

## 2. Update imports

Before:

```ts
import { Zalo } from "zca-js";

const zalo = new Zalo();
```

After (preferred):

```ts
import { ZcaMT } from "zca-mt";

const zalo = new ZcaMT();
```

You do **not** have to rename `Zalo` everywhere immediately — `zca-mt` still
exports `Zalo` as a compatibility alias for `ZcaMT`, so this also works
unchanged after just swapping the package name:

```ts
import { Zalo } from "zca-mt"; // still works

const zalo = new Zalo();
```

We recommend switching to `ZcaMT` in new code, but there is no forced
deadline to rename existing call sites.

## 3. What's kept the same

- Every method on the client (`login`, `loginQR`) and on the returned `API`
  object (`sendMessage`, `getUserInfo`, `getGroupInfo`, `sendSticker`, the
  `listener`, etc.) — unchanged in name, signature, and behavior.
- All types re-exported from `zca-js`'s public surface (`ThreadType`,
  `MessageContent`, `Credentials`, `Options`, and so on).
- The `Listener`'s event names and payloads (`message`, `connected`,
  `disconnected`, `closed`, `error`, `typing`, `reaction`, `group_event`,
  `friend_event`, `undo`, `upload_attachment`, `cipher_key`,
  `old_messages`, `old_reactions`, `seen_messages`, `delivered_messages`).
- Error classes `ZaloApiError`, `ZaloApiMissingImageMetadataGetter`,
  `ZaloApiLoginQRAborted`, `ZaloApiLoginQRDeclined` — still exported and
  thrown from the same places.

## 4. What's renamed

| Before (`zca-js`) | After (`zca-mt`) | Notes                                                             |
| ----------------- | ---------------- | ----------------------------------------------------------------- |
| `Zalo`            | `ZcaMT`          | `Zalo` still works as an alias; `ZcaMT` is preferred in new code. |
| package `zca-js`  | package `zca-mt` | update `package.json` and imports.                                |

No other public method or type names were renamed in this fork.

## 5. What's deprecated

Nothing from the original public API is deprecated in this fork. `Zalo`
remains a first-class export, not a deprecated shim scheduled for removal.

## 6. Breaking changes

None for existing `zca-js` call sites, other than the package name itself
(`zca-js` → `zca-mt`). If you were importing internal/unexported paths
(anything not re-exported from the package root), those are out of scope
for this compatibility guarantee, as they were never part of `zca-js`'s
public API either.

## 7. `imageMetadataGetter`

No change required. The option name, signature
(`(filePath: string) => Promise<{ width, height, size } | null>`), and
behavior are identical to upstream. `zca-mt` additionally offers an
**optional** wrapper, `withImageMetadataValidation`, if you want stricter
error messages when your getter returns incomplete data — you don't need to
adopt it to keep existing code working.

## 8. Sessions / cookies

`zca-mt` does not change how `login()`/`loginQR()` produce or consume
`Credentials` (`cookie`, `imei`, `userAgent`). If you were already saving
and reloading a `Credentials` object with `zca-js`, the same object shape
continues to work with `zca-mt`'s `login()`.

That said, **this has not been independently re-verified against every
Zalo account state** as part of this fork (e.g. sessions saved under very
old `zca-js` versions, or accounts with unusual security settings). If you
hit an issue restoring an old session, the safe fallback is always to run
`loginQR()` again to obtain a fresh session — do not assume compatibility
without testing against your own account first.
