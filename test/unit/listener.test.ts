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
});
