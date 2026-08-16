/**
 * examples/basic-bot.ts
 *
 * A deliberately small, safe example bot built on zca-mt.
 *
 * Supported commands:
 *   !ping          -> replies "pong"
 *   !help          -> lists available commands
 *   !echo <text>   -> replies with <text>
 *
 * Safety properties (do not remove when adapting this example):
 *   - Ignores messages sent by the logged-in account itself.
 *   - Only processes plain-text message content.
 *   - Only responds in threads listed in ZCA_MT_ALLOWED_THREAD_IDS.
 *   - Rate-limits outgoing replies per thread to avoid spammy behavior.
 *   - Never sends unsolicited/bulk messages and never auto-joins groups.
 *   - Never logs or stores message content — it is only read in-memory to
 *     decide how to respond.
 *
 * Not run automatically by the test suite (`npm test`) — this file requires
 * a real, interactive QR login and is meant to be run manually with:
 *   npx tsx examples/basic-bot.ts
 */
import { CommandRouter, ZcaMT } from "../src/index.js";
import type { Message, ThreadType } from "../src/index.js";

const COMMAND_PREFIX = process.env.ZCA_MT_COMMAND_PREFIX?.trim() || "!";

const ALLOWED_THREAD_IDS = new Set(
    (process.env.ZCA_MT_ALLOWED_THREAD_IDS ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
);

if (ALLOWED_THREAD_IDS.size === 0) {
    console.warn(
        "[basic-bot] ZCA_MT_ALLOWED_THREAD_IDS is empty — the bot will not respond in any thread. " +
            "Set it in your .env file (see .env.example) to a comma-separated list of thread IDs you control.",
    );
}

const HELP_TEXT = [
    `${COMMAND_PREFIX}ping - check if the bot is alive`,
    `${COMMAND_PREFIX}help - show this message`,
    `${COMMAND_PREFIX}echo <text> - echoes <text> back`,
].join("\n");

const zca = new ZcaMT({ logging: true });
const api = await zca.loginQR();

const commands = new CommandRouter<Message>({
    prefix: COMMAND_PREFIX,
    rateLimit: { maxCalls: 5, intervalMs: 60_000, maxQueueSize: 10 },
});

async function reply(message: Message, text: string) {
    await api.sendMessage({ msg: text, quote: message.data }, message.threadId, message.type as ThreadType);
}

commands
    .register("ping", ({ message }) => reply(message, "pong"))
    .register("help", ({ message }) => reply(message, HELP_TEXT))
    .register("echo", ({ message, rawArgs }) => reply(message, rawArgs || "(nothing to echo)"));

api.listener.on("message", async (message) => {
    if (message.isSelf) return;
    if (typeof message.data.content !== "string") return;

    const threadId = message.threadId;
    if (!ALLOWED_THREAD_IDS.has(threadId)) return;

    await commands.dispatch({ text: message.data.content.trim(), threadId, message });
});

api.listener.on("reconnecting", (attempt, delayMs) => {
    console.warn(`[basic-bot] Reconnecting (attempt ${attempt}) in ${delayMs}ms.`);
});
api.listener.start({ retryOnClose: true, retryJitter: 0.2, maxRetryDelayMs: 30_000 });

async function shutdown(signal: string) {
    console.log(`\nReceived ${signal}, stopping zca-mt...`);
    try {
        api.listener.stop();
    } finally {
        process.exitCode = 0;
    }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
