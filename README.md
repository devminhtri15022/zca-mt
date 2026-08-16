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

## 📋 Requirements

- [Node.js](https://nodejs.org/) **20 or newer**
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
    api.listener.stop();
    process.exitCode = 0;
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
```

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
