import { describe, expect, it, vi } from "vitest";
import { CommandRouter } from "../../src/bot.js";

describe("CommandRouter", () => {
    it("dispatches a registered command with parsed arguments", async () => {
        const handler = vi.fn();
        const router = new CommandRouter<{ id: string }>({
            prefix: "/",
            rateLimit: { maxCalls: 10, intervalMs: 1_000 },
        }).register("echo", handler);

        await expect(router.dispatch({ text: "/ECHO hello world", threadId: "t1", message: { id: "m1" } })).resolves.toBe(
            true,
        );
        expect(handler).toHaveBeenCalledWith({
            command: "echo",
            args: ["hello", "world"],
            rawArgs: "hello world",
            threadId: "t1",
            message: { id: "m1" },
        });
    });

    it("ignores plain text and unknown commands", async () => {
        const router = new CommandRouter();
        await expect(router.dispatch({ text: "hello", threadId: "t1", message: {} })).resolves.toBe(false);
        await expect(router.dispatch({ text: "!missing", threadId: "t1", message: {} })).resolves.toBe(false);
    });

    it("rejects duplicate commands", () => {
        const router = new CommandRouter().register("ping", () => undefined);
        expect(() => router.register("PING", () => undefined)).toThrow(/duplicate/i);
    });
});
