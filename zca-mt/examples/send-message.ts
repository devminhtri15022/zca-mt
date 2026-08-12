/**
 * examples/send-message.ts
 *
 * Shows sending a text message and replying (quoting) to an incoming
 * message. Replace THREAD_ID_PLACEHOLDER with a real thread ID that
 * belongs to an account/conversation you are authorized to manage.
 *
 * This example does not send anything on its own when run in a test
 * environment — it only sends once you fill in a real thread ID and run it
 * manually.
 */
import { ZcaMT, ThreadType } from "../src/index.js";

const THREAD_ID_PLACEHOLDER = "REPLACE_WITH_A_REAL_THREAD_ID";

const zca = new ZcaMT();
const api = await zca.loginQR();

// Send a plain text message.
await api.sendMessage(
    {
        msg: "Xin chào từ ZCA-MT!",
    },
    THREAD_ID_PLACEHOLDER,
    ThreadType.User,
);

// Reply (quote) to an incoming message.
api.listener.on("message", async (message) => {
    if (message.isSelf) return;
    if (typeof message.data.content !== "string") return;

    if (message.data.content === "!ping") {
        await api.sendMessage(
            {
                msg: "pong",
                quote: message.data,
            },
            message.threadId,
            message.type,
        );
    }
});

api.listener.start();
