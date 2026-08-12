/**
 * examples/basic-bot.ts
 *
 * A deliberately small, safe example bot built on ZCA-MT.
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
import { ZcaMT, RateLimiter } from "../src/index.js";
import type { ThreadType } from "../src/index.js";

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

// Per-thread rate limiting: at most 5 replies per thread per minute.
const rateLimiters = new Map<string, RateLimiter>();
function limiterFor(threadId: string): RateLimiter {
    let limiter = rateLimiters.get(threadId);
    if (!limiter) {
        limiter = new RateLimiter({ maxCalls: 5, intervalMs: 60_000 });
        rateLimiters.set(threadId, limiter);
    }
    return limiter;
}

const HELP_TEXT = [
    `${COMMAND_PREFIX}ping - check if the bot is alive`,
    `${COMMAND_PREFIX}help - show this message`,
    `${COMMAND_PREFIX}echo <text> - echoes <text> back`,
].join("\n");

const zca = new ZcaMT({ logging: true });
const api = await zca.loginQR();

api.listener.on("message", async (message) => {
    if (message.isSelf) return;
    if (typeof message.data.content !== "string") return;

    const threadId = message.threadId;
    if (!ALLOWED_THREAD_IDS.has(threadId)) return;

    const text = message.data.content.trim();
    if (!text.startsWith(COMMAND_PREFIX)) return;

    const [command, ...rest] = text.slice(COMMAND_PREFIX.length).split(/\s+/);
    const argument = rest.join(" ");

    let reply: string | null = null;
    switch (command) {
        case "ping":
            reply = "pong";
            break;
        case "help":
            reply = HELP_TEXT;
            break;
        case "echo":
            reply = argument.length > 0 ? argument : "(nothing to echo)";
            break;
        default:
            return; // unknown command: stay silent, do not spam the thread
    }

    const limiter = limiterFor(threadId);
    if (!limiter.tryAcquire()) {
        console.warn(`[basic-bot] Rate limit hit for thread ${threadId}, dropping reply.`);
        return;
    }

    await api.sendMessage({ msg: reply, quote: message.data }, threadId, message.type as ThreadType);
});

api.listener.start();

async function shutdown(signal: string) {
    console.log(`\nReceived ${signal}, stopping ZCA-MT...`);
    try {
        api.listener.stop();
    } finally {
        process.exitCode = 0;
    }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
