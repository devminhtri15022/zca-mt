import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the `ws` module so the Listener never opens a real network socket.
// Each fake WebSocket instance is inert until the test manually triggers
// its on* handlers, giving full control over the lifecycle in-test.
class FakeWebSocket {
    static instances: FakeWebSocket[] = [];

    public onopen: (() => void) | null = null;
    public onclose: ((event: { code: number; reason: string }) => void) | null = null;
    public onerror: ((event: unknown) => void) | null = null;
    public onmessage: ((event: { data: unknown }) => void) | null = null;
    public readyState = 1; // OPEN

    constructor(
        public url: string,
        public opts: unknown,
    ) {
        FakeWebSocket.instances.push(this);
    }

    close() {
        this.readyState = 3; // CLOSED
    }

    terminate() {
        this.readyState = 3; // CLOSED
    }
}

vi.mock("ws", () => ({
    default: FakeWebSocket,
}));

const { Listener, CloseReason } = await import("../../src/apis/listen.js");
const { ZaloApiError } = await import("../../src/Errors/ZaloApiError.js");

function makeFakeCtx() {
    return {
        cookie: { getCookieStringSync: () => "cookie=fake" },
        userAgent: "test-agent",
        uid: "own-uid",
        options: { selfListen: false, agent: undefined },
        settings: {
            features: {
                socket: {
                    retries: {},
                    close_and_retry_codes: [3003],
                    rotate_error_codes: [],
                    ping_interval: 10_000,
                },
            },
        },
        API_VERSION: 1,
        API_TYPE: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
}

describe("Listener lifecycle", () => {
    beforeEach(() => {
        FakeWebSocket.instances = [];
    });

    it("start() creates a websocket connection and emits 'connected' on open", () => {
        const listener = new Listener(makeFakeCtx(), ["wss://example.invalid/ws"]);
        const onConnected = vi.fn();
        listener.on("connected", onConnected);

        listener.start();
        const ws = FakeWebSocket.instances[0];
        expect(ws).toBeDefined();

        ws.onopen?.();
        expect(onConnected).toHaveBeenCalledTimes(1);
    });

    it("throws when start() is called twice without stopping first", () => {
        const listener = new Listener(makeFakeCtx(), ["wss://example.invalid/ws"]);
        listener.start();

        expect(() => listener.start()).toThrow(ZaloApiError);
        expect(() => listener.start()).toThrow(/already started/i);
    });

    it("stop() closes the underlying connection with a manual-closure code", () => {
        const listener = new Listener(makeFakeCtx(), ["wss://example.invalid/ws"]);
        listener.start();
        const ws = FakeWebSocket.instances[0];
        const closeSpy = vi.spyOn(ws, "close");

        listener.stop();
        expect(closeSpy).toHaveBeenCalledWith(CloseReason.ManualClosure);
    });

    it("allows start() again after stop()", () => {
        const listener = new Listener(makeFakeCtx(), ["wss://example.invalid/ws"]);
        listener.start();
        listener.stop();

        expect(() => listener.start()).not.toThrow();
        expect(FakeWebSocket.instances.length).toBe(2);
    });

    it("emits 'closed' with the close code and reason when the socket closes without retry", () => {
        const listener = new Listener(makeFakeCtx(), ["wss://example.invalid/ws"]);
        const onClosed = vi.fn();
        listener.on("closed", onClosed);

        listener.start(); // no retryOnClose -> immediate 'closed' emission
        const ws = FakeWebSocket.instances[0];
        ws.onclose?.({ code: CloseReason.ManualClosure, reason: "bye" });

        expect(onClosed).toHaveBeenCalledWith(CloseReason.ManualClosure, "bye");
    });

    it("forwards socket errors through the 'error' event without throwing", () => {
        const listener = new Listener(makeFakeCtx(), ["wss://example.invalid/ws"]);
        const onError = vi.fn();
        listener.on("error", onError);

        listener.start();
        const ws = FakeWebSocket.instances[0];
        expect(() => ws.onerror?.({ message: "boom" })).not.toThrow();
        expect(onError).toHaveBeenCalledTimes(1);
    });

    it("exposes connection health snapshots", () => {
        const listener = new Listener(makeFakeCtx(), ["wss://example.invalid/ws"]);
        listener.start({ heartbeatTimeoutMs: 0, healthCheckIntervalMs: 0, stableConnectionMs: 0 });
        FakeWebSocket.instances[0].onopen?.();

        const health = listener.getHealthSnapshot();
        expect(health.state).toBe("connected");
        expect(health.healthy).toBe(true);
        expect(health.lastActivityAt).toBeGreaterThan(0);
        listener.stop();
    });

    it("applies exponential reconnect backoff after repeated network closes", async () => {
        vi.useFakeTimers();
        try {
            const ctx = makeFakeCtx();
            ctx.settings.features.socket.retries = {
                "3003": { times: [10, 10, 10], max: 3 },
            };
            const listener = new Listener(ctx, ["wss://example.invalid/ws"]);
            const reconnecting = vi.fn();
            listener.on("reconnecting", reconnecting);
            const options = {
                retryOnClose: true,
                retryJitter: 0,
                maxRetryDelayMs: 100,
                reconnectCooldownMs: 0,
                retryBackoffFactor: 2,
                maxReconnectAttempts: 5,
                stableConnectionMs: 10_000,
                heartbeatTimeoutMs: 0,
                healthCheckIntervalMs: 0,
            } as const;

            listener.start(options);
            FakeWebSocket.instances[0].onopen?.();
            FakeWebSocket.instances[0].onclose?.({ code: 3003, reason: "network" });
            expect(reconnecting).toHaveBeenLastCalledWith(1, 10, 3003);

            await vi.advanceTimersByTimeAsync(10);
            FakeWebSocket.instances[1].onopen?.();
            FakeWebSocket.instances[1].onclose?.({ code: 3003, reason: "network" });
            expect(reconnecting).toHaveBeenLastCalledWith(2, 20, 3003);
            listener.stop();
        } finally {
            vi.useRealTimers();
        }
    });

    it("continues configured recoverable reconnects after protocol retry limits", async () => {
        vi.useFakeTimers();
        try {
            const ctx = makeFakeCtx();
            ctx.settings.features.socket.retries = {
                "3003": { times: [10], max: 1 },
            };
            const listener = new Listener(ctx, ["wss://example.invalid/ws"]);
            const reconnecting = vi.fn();
            listener.on("reconnecting", reconnecting);
            listener.start({
                retryOnClose: true,
                continuousReconnect: true,
                retryJitter: 0,
                maxRetryDelayMs: 100,
                reconnectCooldownMs: 0,
                retryBackoffFactor: 2,
                maxReconnectAttempts: 1,
                stableConnectionMs: 10_000,
                heartbeatTimeoutMs: 0,
                healthCheckIntervalMs: 0,
            });
            FakeWebSocket.instances[0].onopen?.();
            FakeWebSocket.instances[0].onclose?.({ code: 3003, reason: "network" });
            expect(reconnecting).toHaveBeenLastCalledWith(1, 10, 3003);

            await vi.advanceTimersByTimeAsync(10);
            FakeWebSocket.instances[1].onopen?.();
            FakeWebSocket.instances[1].onclose?.({ code: 3003, reason: "network" });
            expect(reconnecting).toHaveBeenLastCalledWith(2, 100, 3003);
            expect(listener.getState()).toBe("reconnecting");
            listener.stop();
        } finally {
            vi.useRealTimers();
        }
    });

    it("does not continuously reconnect for unconfigured close codes", () => {
        const listener = new Listener(makeFakeCtx(), ["wss://example.invalid/ws"]);
        const closed = vi.fn();
        listener.on("closed", closed);
        listener.start({ retryOnClose: true, continuousReconnect: true, healthCheckIntervalMs: 0 });
        FakeWebSocket.instances[0].onclose?.({ code: 4001, reason: "not recoverable" });

        expect(closed).toHaveBeenCalledWith(4001, "not recoverable");
        expect(listener.getState()).toBe("idle");
        expect(FakeWebSocket.instances).toHaveLength(1);
    });
});
