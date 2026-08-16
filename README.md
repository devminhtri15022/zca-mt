# ZCA-MT

**Unofficial Zalo API for JavaScript and TypeScript**

ZCA-MT lets you automate a personal Zalo account from Node.js: log in via QR
code, listen for messages and group events in real time, and send text,
images, files, and stickers.

## ⚠️ Unofficial API — read this first

> ZCA-MT is an **unofficial** API and is **not affiliated with or endorsed
> by Zalo**. It works by interacting with Zalo Web, and it may stop working
> at any time if Zalo changes its system.
>
> Using an unofficial API may result in **account restrictions or account
> locking**. Use only with accounts and conversations you are authorized to
> manage. Do not use this library to spam, mass-message, or harass anyone.

## Requirements

- Node.js **20** or newer
- npm

## Installation

```bash
npm install zca-mt
```

## Quick start — QR login

```ts
import { ZcaMT } from "zca-mt";

const zca = new ZcaMT();
const api = await zca.loginQR();

console.log("Logged in as:", await api.fetchAccountInfo());
```

The QR code is only ever shown locally (in your terminal, or saved to the
optional `qrPath` you provide) — ZCA-MT never uploads it anywhere, and never
prints your cookies or tokens to the console.

With explicit options and their defaults:

```ts
const zca = new ZcaMT({
    selfListen: false, // don't emit "message" events for messages you sent yourself
    checkUpdate: true, // check for known-incompatible client versions on login
    logging: true, // enable ZCA-MT's own (redacted) console logging
});
```

## Listening for messages

```ts
import { ZcaMT, ThreadType } from "zca-mt";

const zca = new ZcaMT();
const api = await zca.loginQR();

api.listener.on("message", async (message) => {
    if (message.isSelf) return;

    const content = message.data.content;
    if (typeof content !== "string") return;

    console.log({
        threadId: message.threadId,
        type: message.type, // ThreadType.User or ThreadType.Group
        content,
    });
});

api.listener.start();
```

Other listener events include `connected`, `disconnected`, `closed`,
`error`, `typing`, `reaction`, `group_event`, and `friend_event`. See
[`src/apis/listen.ts`](./src/apis/listen.ts) for the full, current list —
this README intentionally doesn't restate the whole event surface, since it
can grow as the upstream project adds features.

### Graceful shutdown

```ts
async function shutdown(signal: string) {
    console.log(`Received ${signal}, stopping ZCA-MT...`);
    try {
        api.listener.stop();
    } finally {
        process.exitCode = 0;
    }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
```

Calling `listener.start()` a second time while already running is a no-op
guarded internally; always call `listener.stop()` before process exit to
close the underlying WebSocket cleanly.

## Sending messages

```ts
await api.sendMessage(
    {
        msg: "Xin chào từ ZCA-MT!",
    },
    threadId,
    ThreadType.User,
);
```

### Replying (quoting) to a message

```ts
await api.sendMessage(
    {
        msg: "Đây là nội dung trả lời",
        quote: originalMessage.data,
    },
    originalMessage.threadId,
    originalMessage.type,
);
```

### Sending an image, with `imageMetadataGetter`

Zalo's upload endpoint requires image width/height/size metadata. ZCA-MT
does not bundle an image-decoding library — you provide a small function
that reads it, so `sharp` (or any other image library) stays an optional
choice rather than a hard dependency of this package.

```bash
npm install sharp
```

```ts
import fs from "node:fs";
import sharp from "sharp";
import { ZcaMT, withImageMetadataValidation } from "zca-mt";

async function imageMetadataGetter(filePath: string) {
    const data = await fs.promises.readFile(filePath);
    const metadata = await sharp(data).metadata();

    return {
        width: metadata.width,
        height: metadata.height,
        size: metadata.size ?? data.length,
    };
}

const zca = new ZcaMT({
    // Wrapping with withImageMetadataValidation() makes ZCA-MT throw a clear
    // ValidationError if width/height come back missing, instead of sending
    // malformed data to Zalo's servers.
    imageMetadataGetter: withImageMetadataValidation(imageMetadataGetter),
});

const api = await zca.loginQR();

await api.sendMessage(
    {
        msg: "Ảnh đính kèm",
        attachments: "./photo.jpg",
    },
    threadId,
    ThreadType.User,
);
```

`sharp` is **not** a dependency of `zca-mt` — install it yourself only if
you plan to send images from file paths.

## API reference (high level)

| Area                                   | Status                     | Notes                                                                              |
| -------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------- |
| QR login                               | ✅                         | `zca.loginQR()`                                                                    |
| Cookie/session login                   | ✅                         | `zca.login(credentials)`, if you already have a valid cookie/imei/userAgent bundle |
| Fetch own account info                 | ✅                         | `api.fetchAccountInfo()`                                                           |
| Listen for messages                    | ✅                         | `api.listener.on("message", ...)`                                                  |
| Listen for group/friend events         | ✅                         | `api.listener.on("group_event" \| "friend_event", ...)`                            |
| `ThreadType.User` / `ThreadType.Group` | ✅                         | distinguishes 1:1 vs group threads                                                 |
| Send text message                      | ✅                         | `api.sendMessage(...)`                                                             |
| Reply/quote a message                  | ✅                         | pass `quote` in `MessageContent`                                                   |
| Send image / file / video / voice      | ✅                         | `attachments` in `MessageContent`, or `sendVideo` / `sendVoice`                    |
| Send sticker                           | ✅                         | `api.sendSticker(...)`                                                             |
| Get user info                          | ✅                         | `api.getUserInfo(...)`                                                             |
| Get group info                         | ✅                         | `api.getGroupInfo(...)`                                                            |
| Start/stop listener                    | ✅                         | `api.listener.start()` / `api.listener.stop()`                                     |
| Reconnect handling                     | ✅ (inherited from zca-js) | governed by server-provided retry policy; see `Listener` in `src/apis/listen.ts`   |

This table reflects what the underlying `zca-js` protocol implementation
supports as of this fork. ZCA-MT does not add endpoints that don't exist
upstream — if something isn't listed here, treat it as **not supported**.
For the full, exact method and type list, browse `src/apis/` or the
generated type declarations.

## Session security

ZCA-MT does **not** persist your login session by default. Every call to
`loginQR()` starts a fresh interactive login unless your application
explicitly stores and reuses a `Credentials` object.

If you want to skip re-scanning the QR code on every run, you can opt in
using the provided helpers:

```ts
import { ZcaMT } from "zca-mt";
import { saveSession, loadSession } from "zca-mt";

const sessionPath = "./.zca-mt/session.json";
const zca = new ZcaMT();

let api;
try {
    api = await zca.login(loadSession(sessionPath));
} catch {
    api = await zca.loginQR();
    const ctx = api.getContext();
    saveSession(sessionPath, {
        imei: ctx.imei,
        userAgent: ctx.userAgent,
        cookie: ctx.cookie.toJSON()?.cookies ?? [],
    });
}
```

- `saveSession` writes the file with owner-only permissions (`0600`) where
  the OS supports it.
- **Never commit a session file to version control.** The `.gitignore`
  shipped with this repository already excludes common session file names
  (`session.json`, `credentials.json`, `.zca-mt/`, etc.) — keep that pattern
  if you rename the file.
- A session file is equivalent to a live, logged-in cookie. Treat it like a
  password: don't share it, don't log it, and store it somewhere only your
  application can read.

## Troubleshooting

- **QR code expires before I scan it** — re-run `loginQR()`; QR codes are
  time-limited by Zalo, not by ZCA-MT.
- **Listener disconnects repeatedly** — check the `closed`/`error` events
  for a reason code; some close codes indicate you logged in elsewhere
  (`DuplicateConnection`) or were kicked (`KickConnection`), in which case
  reconnecting won't help until you log in again.
- **`ZaloApiMissingImageMetadataGetter` when sending an image** — you must
  provide `imageMetadataGetter` in the `ZcaMT` options; see the image
  example above.
- **Account gets rate-limited or logged out unexpectedly** — this is a risk
  inherent to any unofficial client; reduce request frequency, avoid
  automated bulk sending, and see the warning at the top of this README.

## Contributing

Contributions are welcome. Please:

1. Open an issue describing the change before large PRs.
2. Run `npm run typecheck`, `npm run lint`, `npm run format:check`, and
   `npm test` before submitting.
3. Do not add functionality for spamming, mass-messaging, credential
   harvesting, or bypassing Zalo's CAPTCHA/2FA/rate-limit protections — such
   changes will not be accepted.
4. If you're changing behavior inherited from `zca-js`, note that clearly in
   your PR description, since it affects compatibility with the upstream
   project.

## Credits

ZCA-MT is developed from the open-source
[zca-js](https://github.com/RFS-ADRENO/zca-js) project by
[RFS-ADRENO](https://github.com/RFS-ADRENO).

The original copyright notice and MIT License are preserved. See
[`NOTICE.md`](./NOTICE.md) for details on what this fork changed.

## License

MIT — see [`LICENSE`](./LICENSE).
"# zca-mt"  
