<div align="center">

# ZCA-MT

### Unofficial Zalo API for JavaScript & TypeScript

[![npm](https://img.shields.io/npm/v/zca-mt?style=flat-square&color=cb3837)](https://www.npmjs.com/package/zca-mt)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A520-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](./LICENSE)

Automate a personal Zalo account from Node.js: sign in with a QR code, receive
real-time events, and send messages, images, files, stickers, video, and voice.

[Getting started](#-getting-started) · [Usage](#-usage) · [API overview](#-api-overview) · [Troubleshooting](#-troubleshooting)

</div>

> [!WARNING]
> ZCA-MT is an **unofficial** API and is not affiliated with or endorsed by
> Zalo. It interacts with Zalo Web and may stop working when Zalo changes its
> system. Using an unofficial client may cause account restrictions. Only use
> accounts and conversations you are authorized to manage. Do not use this
> package for spam, harassment, or unsolicited bulk messaging.

## ✨ Features

- QR-code and session-based login
- Real-time messages, reactions, typing, group events, and friend events
- Text, image, file, sticker, video, and voice messages
- User, friend, group, reminder, poll, catalog, and conversation APIs
- First-class TypeScript declarations
- ESM and CommonJS builds
- Optional local session persistence
- Per-thread command queues, request limits, health snapshots, and bounded reconnect backoff

## 📋 Requirements

- [Node.js](https://nodejs.org/) **20 or newer**. CI tests Node 20, 22, 24,
  and the latest stable Node release on Linux and Windows.
- npm or another compatible package manager

## 🚀 Getting started

### Install

```bash
npm install zca-mt
```

### Log in with a QR code

```ts
import { ZcaMT } from "zca-mt";

const zca = new ZcaMT();
const api = await zca.loginQR();

console.log("Logged in as:", await api.fetchAccountInfo());
```

The QR code is shown locally in your terminal or written to the optional path
you provide. ZCA-MT does not upload it or print your cookies and tokens.

### Configuration

```ts
const zca = new ZcaMT({
    selfListen: false, // Ignore messages sent by the logged-in account
    checkUpdate: true, // Check for known incompatible client versions
    logging: true, // Enable redacted ZCA-MT logs
});
```

### Stronger session protection

```ts
import {
    saveEncryptedSession,
    loadEncryptedSession,
    saveSessionAsync,
    loadEncryptedSessionAsync,
    deleteSessionAsync,
} from "zca-mt";

const sessionPath = "./.zca-mt/session.json";
const passphrase = "a-strong-32char-passphrase-here";

await saveEncryptedSessionAsync(sessionPath, api.getContext(), passphrase);
const restored = await loadEncryptedSessionAsync(sessionPath, passphrase);
await deleteSessionAsync(sessionPath);
```

## 💡 Usage

### Listen and reply to messages

```ts
import { ZcaMT } from "zca-mt";

const zca = new ZcaMT();
const api = await zca.loginQR();

api.listener.on("message", async (message) => {
    if (message.isSelf) return;

    const content = message.data.content;
    if (typeof content !== "string") return;

    console.log({
        threadId: message.threadId,
        threadType: message.type,
        content,
    });

    await api.sendMessage(
        { msg: `You sent: ${content}` },
        message.threadId,
        message.type,
    );
});

api.listener.start();
```

Listener events include `connected`, `disconnected`, `closed`, `error`,
`message`, `typing`, `reaction`, `group_event`, and `friend_event`. See
[`src/apis/listen.ts`](./src/apis/listen.ts) for the current event surface.

### Send a text message

```ts
import { ThreadType } from "zca-mt";

await api.sendMessage(
    { msg: "Hello from ZCA-MT!" },
    threadId,
    ThreadType.User,
);
```

Use `ThreadType.Group` when the target is a group conversation.

### Reply to a message

```ts
await api.sendMessage(
    {
        msg: "This is a reply",
        quote: originalMessage.data,
    },
    originalMessage.threadId,
    originalMessage.type,
);
```

### Send an image

Zalo requires image width, height, and size metadata. Install an image library
such as `sharp` when needed:

```bash
npm install sharp
```

```ts
import fs from "node:fs";
import sharp from "sharp";
import { ThreadType, withImageMetadataValidation, ZcaMT } from "zca-mt";

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
    imageMetadataGetter: withImageMetadataValidation(imageMetadataGetter),
});

const api = await zca.loginQR();

await api.sendMessage(
    { msg: "Photo attachment", attachments: "./photo.jpg" },
    threadId,
    ThreadType.User,
);
```

`sharp` is optional and is not included in `zca-mt` dependencies.

### Stop the listener safely

```ts
function shutdown(signal: string) {
    console.log(`Received ${signal}. Stopping ZCA-MT...`);
    router.close(); // Reject commands that have not started; active handlers finish normally.
    api.listener.stop();
    process.exitCode = 0;
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
```

### Production hardening for long-running bots

The listener already sends the protocol ping required by the active Zalo
connection. For monitoring and bounded recovery, enable reconnects and health
snapshots:

```ts
api.listener.on("health", (health) => {
    if (!health.healthy) {
        console.warn("ZCA-MT listener is unhealthy", {
            state: health.state,
            silenceMs: health.silenceMs,
            reconnectAttempts: health.reconnectAttempts,
        });
    }
});

api.listener.start({
    retryOnClose: true,
    continuousReconnect: true,
    retryBackoffFactor: 1.5,
    reconnectCooldownMs: 1_000,
    maxRetryDelayMs: 30_000,
    healthCheckIntervalMs: 30_000,
});
```

`continuousReconnect` keeps retrying only close codes configured by the
protocol client as recoverable, even after its finite retry schedule is
exhausted. Its backoff remains capped by `maxRetryDelayMs`; it does not retry
authentication, kick, or other close codes that are not configured as
recoverable. Without this option reconnect attempts are bounded by
`maxReconnectAttempts` (default: 20).
Use `api.listener.getHealthSnapshot()` for an on-demand snapshot. A health
event is observability, not a guarantee that the process, network, or account
will remain available; use a process manager and handle `closed` and `error`
events in your application.

`CommandRouter` serializes commands within each thread, applies both per-thread
and optional global limits, bounds queued work, and accepts an `AbortSignal`:

```ts
import { CommandRouter, RateLimiter } from "zca-mt";

const router = new CommandRouter({
    rateLimit: { maxCalls: 5, intervalMs: 60_000, maxQueueSize: 10 },
    globalRateLimit: { maxCalls: 20, intervalMs: 60_000, maxQueueSize: 50 },
    maxPendingPerThread: 20,
    maxPendingCommands: 500,
    maxConcurrentCommands: 20,
});

router.register("ping", async ({ threadId, signal }) => {
    if (signal?.aborted) return;
    // Handle one command at a time for this thread.
});

// For a scheduled, opt-in API operation, a limiter can cap traffic to one
// request per two hours. tryAcquire() drops/skips work instead of building
// a backlog that would run later.
const maintenanceRequestLimit = new RateLimiter({
    maxCalls: 1,
    intervalMs: 2 * 60 * 60 * 1_000,
    cooldownMs: 2 * 60 * 60 * 1_000,
    maxQueueSize: 0,
});

if (maintenanceRequestLimit.tryAcquire()) {
    await api.fetchAccountInfo();
}
```

This two-hour setting is a request cap, not a scheduler or a keep-alive
requirement. ZCA-MT does not send extra account requests to keep a bot alive.
Keep any scheduled work authorized, necessary, and compliant with Zalo's
usage rules; an in-memory limiter resets when the process restarts.

For operations that are explicitly safe to repeat, `retryIdempotent` uses
bounded exponential backoff and honors `retryAfterMs` / HTTP `Retry-After`
hints. Do not wrap message sends or other non-idempotent writes in automatic
retries.

### Run the production example under a process manager

[`examples/production-bot.ts`](./examples/production-bot.ts) demonstrates
encrypted session reuse, attended QR login when needed, allowed-thread checks,
in-process duplicate-message suppression, health/error logs, continuous
reconnect for configured recoverable socket errors, and bounded graceful
shutdown. It intentionally **does not** repeatedly send requests to keep the
account online.

Install dependencies, then inject secrets and permitted thread IDs through
your host's secret manager or service environment. The repository's
`.env.example` is a template only; the example does not load `.env`
automatically.

```bash
npm ci --include=dev
export ZCA_MT_ALLOWED_THREAD_IDS='thread-id-1,thread-id-2'
# Inject ZCA_MT_SESSION_PASSPHRASE from the host secret manager; do not put
# the real passphrase in shell history or a committed environment file.
npm run build
```

On a first run, use an attended QR login. The resulting session is encrypted
at `ZCA_MT_SESSION_PATH` (default: `.zca-mt/session.json`). If the session
expires, set `ZCA_MT_FORCE_QR=1` for an attended re-authentication; do not
automatically delete or replace a session after an arbitrary login/network
error. Unset `ZCA_MT_FORCE_QR` after re-authentication. Keep the encryption
passphrase outside the repository and restrict access to the session directory.

For PM2, start one process (do not run multiple instances with the same Zalo
account/session):

```bash
npm install --global pm2
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup
pm2 status
pm2 logs zca-mt-bot
```

Run the `pm2 startup` command that PM2 prints for your server so the saved
process list is restored after reboot. PM2 restarts the process after an
uncaught startup failure or nonzero exit; the example exits nonzero when the
listener closes permanently. It handles `SIGINT`/`SIGTERM`, closes queued
commands, waits up to 10 seconds for active commands, then exits within the
configured supervisor kill timeout.

Alternatively, adapt
[`examples/zca-mt-bot.service`](./examples/zca-mt-bot.service) for the
deployment path and dedicated unprivileged service user. Store
`ZCA_MT_SESSION_PASSPHRASE` and `ZCA_MT_ALLOWED_THREAD_IDS` in the referenced
root-owned environment file with restrictive permissions (for example mode
`0600`) or use a system secret manager; never put secrets in a committed unit
file. Then install and enable the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now zca-mt-bot
sudo systemctl status zca-mt-bot
sudo journalctl -u zca-mt-bot -f
```

Before a long unattended run, test a network interruption, a process restart,
a machine reboot, and an expired session. Confirm that recoverable network
close codes reconnect, that non-recoverable/authentication closures alert and
exit for operator action, and that the process manager brings the process
back. Message duplicate suppression in the example is memory-only and expires
after 10 minutes; it is not a durable exactly-once guarantee across restarts.

## 🧩 API overview

| Area | Example |
| --- | --- |
| QR login | `zca.loginQR()` |
| Cookie/session login | `zca.login(credentials)` |
| Account information | `api.fetchAccountInfo()` |
| Message listener | `api.listener.on("message", handler)` |
| Group and friend events | `group_event`, `friend_event` |
| Messages and attachments | `api.sendMessage(...)` |
| Stickers | `api.sendSticker(...)` |
| Video and voice | `api.sendVideo(...)`, `api.sendVoice(...)` |
| User information | `api.getUserInfo(...)` |
| Group information | `api.getGroupInfo(...)` |
| Listener lifecycle | `api.listener.start()`, `api.listener.stop()` |

For the complete method and type list, browse [`src/apis`](./src/apis) and
[`index.d.ts`](./index.d.ts).

## 🔐 Session security

ZCA-MT does not persist login sessions unless your application explicitly does
so. To reuse a session, use the provided helpers:

```ts
import { loadSession, saveSession, ZcaMT } from "zca-mt";

const sessionPath = "./.zca-mt/session.json";
const zca = new ZcaMT();

let api;
try {
    api = await zca.login(loadSession(sessionPath));
} catch {
    api = await zca.loginQR();
    const context = api.getContext();

    saveSession(sessionPath, {
        imei: context.imei,
        userAgent: context.userAgent,
        cookie: context.cookie.toJSON()?.cookies ?? [],
    });
}
```

> [!IMPORTANT]
> A session file is equivalent to a live login credential. Never share it,
> print it in logs, or commit it to Git. Keep `.zca-mt/`, `session.json`, and
> `credentials.json` in `.gitignore`.

## 🛠️ Development

```bash
git clone https://github.com/devminhtri15022/zca-mt.git
cd zca-mt
npm install
npm run check
```

| Command | Purpose |
| --- | --- |
| `npm run build` | Build ESM and CommonJS outputs |
| `npm run typecheck` | Check TypeScript types |
| `npm run lint` | Run ESLint |
| `npm run format:check` | Check formatting |
| `npm test` | Run the test suite |
| `npm run check` | Run all checks and build |

## ❓ Troubleshooting

<details>
<summary><strong>The QR code expired</strong></summary>

Run `loginQR()` again. QR codes are time-limited by Zalo.
</details>

<details>
<summary><strong>The listener repeatedly disconnects</strong></summary>

Inspect the `closed` and `error` events. Some codes indicate another login or
a terminated session; in that case, authenticate again.
</details>

<details>
<summary><strong>ZaloApiMissingImageMetadataGetter is thrown</strong></summary>

Provide `imageMetadataGetter` in the `ZcaMT` options. See the image example.
</details>

<details>
<summary><strong>The account is rate-limited or unexpectedly logged out</strong></summary>

Reduce request frequency and avoid automated bulk sending. Account restrictions
are an inherent risk of unofficial clients.
</details>

## 🤝 Contributing

Contributions are welcome. For substantial changes, open an issue first. Before
submitting a pull request, run `npm run check`.

Changes intended for spam, credential harvesting, or bypassing CAPTCHA, 2FA,
and rate-limit protections will not be accepted.

## 📄 License

Distributed under the MIT License. See [`LICENSE`](./LICENSE).

---

<div align="center">Made for the JavaScript and TypeScript community.</div>
