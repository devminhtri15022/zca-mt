import { existsSync } from "node:fs";
import path from "node:path";
import {
    CommandRouter,
    LoginQRCallbackEventType,
    ZcaMT,
    saveEncryptedSessionAsync,
    loadEncryptedSessionAsync,
} from "../src/index.js";
import type { LoginQRCallbackEvent, Message } from "../src/index.js";
import type { SavedSession } from "../src/session.js";

const sessionPath = path.resolve(process.env.ZCA_MT_SESSION_PATH ?? ".zca-mt/session.json");
const passphrase = process.env.ZCA_MT_SESSION_PASSPHRASE;
if (!passphrase) {
    throw new Error("Set ZCA_MT_SESSION_PASSPHRASE in the process environment.");
}

const allowedThreadIds = new Set(
    (process.env.ZCA_MT_ALLOWED_THREAD_IDS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
);
if (allowedThreadIds.size === 0) {
    throw new Error("Set ZCA_MT_ALLOWED_THREAD_IDS to the comma-separated IDs the bot is allowed to handle.");
}

const zca = new ZcaMT({ logging: true });
const forceQrLogin = process.env.ZCA_MT_FORCE_QR === "1";
let api: Awaited<ReturnType<ZcaMT["login"]>>;

if (!forceQrLogin && existsSync(sessionPath)) {
    const session = await loadEncryptedSessionAsync(sessionPath, passphrase);
    try {
        api = await zca.login(session);
    } catch (cause) {
        throw new Error(
            "Saved session login failed. Verify network/account status or set ZCA_MT_FORCE_QR=1 for an attended QR login.",
            { cause },
        );
    }
} else {
    let newSession: SavedSession | undefined;
    const onQrEvent = (event: LoginQRCallbackEvent) => {
        if (event.type === LoginQRCallbackEventType.GotLoginInfo) {
            newSession = {
                imei: event.data.imei,
                userAgent: event.data.userAgent,
                cookie: event.data.cookie,
            };
        }
    };
    api = await zca.loginQR(undefined, onQrEvent);
    if (!newSession) throw new Error("QR login completed without returning session credentials.");
    await saveEncryptedSessionAsync(sessionPath, newSession, passphrase);
}

const router = new CommandRouter<Message>({
    rateLimit: { maxCalls: 5, intervalMs: 60_000, maxQueueSize: 10 },
    globalRateLimit: { maxCalls: 30, intervalMs: 60_000, maxQueueSize: 50 },
    maxPendingPerThread: 20,
    maxPendingCommands: 200,
    maxConcurrentCommands: 10,
});

async function reply(message: Message, text: string): Promise<void> {
    await api.sendMessage({ msg: text, quote: message.data }, message.threadId, message.type);
}

router
    .register("ping", ({ message }) => reply(message, "pong"))
    .register("help", ({ message }) => reply(message, "!ping - health check\n!help - show commands"));

const seenMessages = new Map<string, number>();
const dedupeWindowMs = 10 * 60_000;
const maxRememberedMessages = 10_000;
let fatalShutdown = false;

function rememberMessage(message: Message): boolean {
    const messageId = message.data.msgId || message.data.cliMsgId;
    if (!messageId) return true;
    const now = Date.now();
    for (const [id, seenAt] of seenMessages) {
        if (now - seenAt >= dedupeWindowMs) seenMessages.delete(id);
        else break;
    }
    const key = `${message.threadId}:${messageId}`;
    if (seenMessages.has(key)) return false;
    seenMessages.set(key, now);
    while (seenMessages.size > maxRememberedMessages) {
        const oldest = seenMessages.keys().next().value;
        if (oldest === undefined) break;
        seenMessages.delete(oldest);
    }
    return true;
}

api.listener.on("message", (message) => {
    if (message.isSelf || typeof message.data.content !== "string") return;
    if (!allowedThreadIds.has(message.threadId) || !rememberMessage(message)) return;

    void router
        .dispatch({
            text: message.data.content.trim(),
            threadId: message.threadId,
            message,
        })
        .catch((error: unknown) => {
            const messageText = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown command error";
            console.error("[production-bot] Command failed:", messageText);
        });
});

let unhealthyReported = false;
api.listener.on("health", (health) => {
    if (health.healthy) {
        unhealthyReported = false;
        return;
    }
    if (unhealthyReported) return;
    unhealthyReported = true;
    console.error("[production-bot] Listener unhealthy:", {
        state: health.state,
        silenceMs: health.silenceMs,
        reconnectAttempts: health.reconnectAttempts,
    });
});

api.listener.on("reconnecting", (attempt, delayMs, code) => {
    console.warn(`[production-bot] Reconnecting after close ${code}; attempt ${attempt} in ${delayMs}ms.`);
});

api.listener.on("error", (error) => {
    const messageText = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown listener error";
    console.error("[production-bot] Listener error:", messageText);
});

api.listener.on("closed", (code, reason) => {
    console.error(`[production-bot] Listener stopped (code ${code}): ${reason}`);
    fatalShutdown = true;
    void shutdown("listener-closed");
});

api.listener.start({
    retryOnClose: true,
    continuousReconnect: true,
    retryJitter: 0.2,
    retryBackoffFactor: 1.5,
    reconnectCooldownMs: 1_000,
    maxRetryDelayMs: 60_000,
    maxReconnectAttempts: 20,
    stableConnectionMs: 30_000,
    heartbeatTimeoutMs: 90_000,
    healthCheckIntervalMs: 30_000,
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[production-bot] Received ${signal}; stopping listener and draining commands.`);
    const forcedExit = setTimeout(() => {
        console.error("[production-bot] Shutdown deadline exceeded; exiting for supervisor restart.");
        process.exit(1);
    }, 15_000);
    api.listener.stop();
    router.close();
    const drained = await router.drain(10_000);
    if (!drained) {
        console.error("[production-bot] Timed out waiting for active commands to finish.");
        process.exitCode = 1;
    } else {
        process.exitCode = fatalShutdown ? 1 : 0;
        clearTimeout(forcedExit);
    }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
