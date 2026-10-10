import { describe, expect, it, vi } from "vitest";
import { CommandRouter } from "../../src/bot.js";
import { RateLimitError } from "../../src/Errors/RateLimitError.js";

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

    it("supports aliases and exposes status stats", async () => {
        const router = new CommandRouter({ prefix: "!" })
            .register("ping", () => "pong")
            .alias("p", "ping");

        await expect(router.dispatch({ text: "!p", threadId: "t1", message: {} })).resolves.toBe(true);
        expect(router.stats().commands).toBe(1);
        expect(router.stats().aliases).toBe(1);
    });

    it("serializes commands per thread and preserves FIFO order", async () => {
        let releaseFirst!: () => void;
        const gate = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        let markFirstStarted!: () => void;
        const firstStarted = new Promise<void>((resolve) => {
            markFirstStarted = resolve;
        });
        const order: string[] = [];
        const router = new CommandRouter<{ id: string }>({ rateLimit: { maxCalls: 10, intervalMs: 1_000 } }).register(
            "work",
            async ({ message }) => {
                order.push(`start:${message.id}`);
                if (message.id === "first") {
                    markFirstStarted();
                    await gate;
                }
                order.push(`end:${message.id}`);
            },
        );

        const first = router.dispatch({ text: "!work", threadId: "t1", message: { id: "first" } });
        await firstStarted;
        const second = router.dispatch({ text: "!work", threadId: "t1", message: { id: "second" } });
        expect(order).toEqual(["start:first"]);
        releaseFirst();
        await Promise.all([first, second]);
        expect(order).toEqual(["start:first", "end:first", "start:second", "end:second"]);
    });

    it("bounds per-thread backlog and rejects dispatch after close", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        let markActiveStarted!: () => void;
        const activeStarted = new Promise<void>((resolve) => {
            markActiveStarted = resolve;
        });
        const router = new CommandRouter<{ id: string }>({
            rateLimit: { maxCalls: 10, intervalMs: 1_000 },
            maxPendingPerThread: 0,
        }).register("work", async ({ message }) => {
            if (message.id === "active") {
                markActiveStarted();
                await gate;
            }
        });

        const active = router.dispatch({ text: "!work", threadId: "t1", message: { id: "active" } });
        await activeStarted;
        await expect(
            router.dispatch({ text: "!work", threadId: "t1", message: { id: "queued" } }),
        ).rejects.toBeInstanceOf(RateLimitError);
        release();
        await active;
        router.close();
        expect(router.stats().closed).toBe(true);
        await expect(router.dispatch({ text: "!work", threadId: "t1", message: { id: "late" } })).rejects.toThrow(
            /closed/i,
        );
    });

    it("rejects queued commands when closed while allowing the active handler to finish", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        let markActiveStarted!: () => void;
        const activeStarted = new Promise<void>((resolve) => {
            markActiveStarted = resolve;
        });
        const router = new CommandRouter<{ id: string }>({
            rateLimit: { maxCalls: 10, intervalMs: 1_000 },
            maxPendingPerThread: 1,
        }).register("work", async ({ message }) => {
            if (message.id === "active") {
                markActiveStarted();
                await gate;
            }
        });
        const active = router.dispatch({ text: "!work", threadId: "t1", message: { id: "active" } });
        await activeStarted;
        const queued = router.dispatch({ text: "!work", threadId: "t1", message: { id: "queued" } });

        router.close();
        await expect(queued).rejects.toThrow(/closed/i);
        release();
        await expect(active).resolves.toBe(true);
    });

    it("bounds concurrent handlers across different threads", async () => {
        let releaseFirst!: () => void;
        const gate = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        let markFirstStarted!: () => void;
        const firstStarted = new Promise<void>((resolve) => {
            markFirstStarted = resolve;
        });
        let markSecondStarted!: () => void;
        const secondStarted = new Promise<void>((resolve) => {
            markSecondStarted = resolve;
        });
        const router = new CommandRouter<{ id: string }>({
            maxConcurrentCommands: 1,
            maxPendingCommands: 2,
        }).register("work", async ({ message }) => {
            if (message.id === "first") {
                markFirstStarted();
                await gate;
            } else {
                markSecondStarted();
            }
        });
        const first = router.dispatch({ text: "!work", threadId: "t1", message: { id: "first" } });
        await firstStarted;
        const second = router.dispatch({ text: "!work", threadId: "t2", message: { id: "second" } });

        expect(router.stats().activeCommands).toBe(1);
        expect(router.stats().queuedCommands).toBe(1);
        releaseFirst();
        await first;
        await secondStarted;
        await expect(second).resolves.toBe(true);
    });

    it("drains active handlers with a timeout result", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });
        const router = new CommandRouter().register("wait", async () => {
            markStarted();
            await gate;
        });
        const dispatched = router.dispatch({ text: "!wait", threadId: "t1", message: {} });
        await started;

        await expect(router.drain(0)).resolves.toBe(false);
        release();
        await expect(dispatched).resolves.toBe(true);
        await expect(router.drain()).resolves.toBe(true);
    });
});
