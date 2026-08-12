/**
 * examples/listen-message.ts
 *
 * Shows the listener lifecycle: connect, receive messages, and shut down
 * gracefully on SIGINT/SIGTERM.
 *
 * Run with a QR login for a quick manual check. This file makes no
 * assumptions about persisted credentials — every run starts a fresh QR
 * login.
 */
import { ZcaMT, ThreadType } from "../src/index.js";

const zca = new ZcaMT({ logging: true });
const api = await zca.loginQR();

api.listener.on("connected", () => {
    console.log("Listener connected");
});

api.listener.on("message", (message) => {
    // Ignore messages sent by the logged-in account itself, to avoid
    // reacting to your own messages (including this bot's own replies).
    if (message.isSelf) return;

    const content = message.data.content;
    if (typeof content !== "string") return; // skip non-text content in this example

    console.log({
        threadId: message.threadId,
        type: message.type === ThreadType.Group ? "group" : "user",
        content,
    });
});

api.listener.on("error", (error) => {
    console.error("Listener error:", error);
});

api.listener.on("closed", (code, reason) => {
    console.log("Listener closed:", code, reason);
});

api.listener.start();

async function shutdown(signal: string) {
    console.log(`\nReceived ${signal}, stopping ZCA-MT listener...`);
    try {
        api.listener.stop();
    } finally {
        process.exitCode = 0;
    }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
