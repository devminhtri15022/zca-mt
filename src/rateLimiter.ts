import { RateLimitError } from "./Errors/RateLimitError.js";

export type RateLimiterOptions = {
    /** Maximum number of calls allowed within `intervalMs`. Default: 20. */
    maxCalls?: number;
    /** Length of the sliding window in milliseconds. Default: 60_000 (1 minute). */
    intervalMs?: number;
    /** Maximum number of callers waiting in the async queue. Default: 100. */
    maxQueueSize?: number;
};

export type RateLimiterSnapshot = {
    active: number;
    remaining: number;
    queued: number;
    retryAfterMs: number;
};

type PendingAcquire = {
    resolve: () => void;
    reject: (error: unknown) => void;
    signal?: AbortSignal;
    onAbort?: () => void;
};

/**
 * A minimal in-memory sliding-window rate limiter.
 *
 * zca-mt does not enforce this automatically on every API call — it is
 * provided as an opt-in building block so bots built on top of zca-mt can
 * throttle their own outgoing actions (e.g. `sendMessage`) and avoid
 * behaving like a spam/mass-messaging tool, which is explicitly out of
 * scope for this project.
 *
 * @example
 * ```ts
 * const limiter = new RateLimiter({ maxCalls: 10, intervalMs: 60_000 });
 *
 * async function safeSend(api: API, msg: string, threadId: string, type: ThreadType) {
 *     await limiter.acquire(); // throws RateLimitError if over budget
 *     return api.sendMessage({ msg }, threadId, type);
 * }
 * ```
 */
export class RateLimiter {
    private readonly maxCalls: number;
    private readonly intervalMs: number;
    private readonly maxQueueSize: number;
    private timestamps: number[] = [];
    private readonly queue: PendingAcquire[] = [];
    private queueTimer?: NodeJS.Timeout;

    constructor(options: RateLimiterOptions = {}) {
        this.maxCalls = options.maxCalls ?? 20;
        this.intervalMs = options.intervalMs ?? 60_000;
        this.maxQueueSize = options.maxQueueSize ?? 100;

        if (this.maxCalls <= 0) {
            throw new RangeError("RateLimiter: maxCalls must be a positive number");
        }
        if (this.intervalMs <= 0) {
            throw new RangeError("RateLimiter: intervalMs must be a positive number");
        }
        if (!Number.isInteger(this.maxQueueSize) || this.maxQueueSize < 0) {
            throw new RangeError("RateLimiter: maxQueueSize must be a non-negative integer");
        }
    }

    private prune(now: number) {
        const cutoff = now - this.intervalMs;
        this.timestamps = this.timestamps.filter((ts) => ts > cutoff);
    }

    /**
     * Returns true and records a call if under budget; otherwise returns false
     * without side effects (non-throwing variant).
     */
    public tryAcquire(now: number = Date.now()): boolean {
        this.prune(now);
        // Do not let new callers jump ahead of callers already waiting.
        if (this.queue.length > 0) return false;
        if (this.timestamps.length >= this.maxCalls) return false;
        this.timestamps.push(now);
        return true;
    }

    /**
     * Throws {@link RateLimitError} if the caller is currently over budget.
     */
    public acquire(now: number = Date.now()): void {
        this.prune(now);
        if (this.queue.length > 0 || this.timestamps.length >= this.maxCalls) {
            const oldest = this.timestamps[0];
            const retryAfterMs = oldest === undefined ? 0 : Math.max(0, oldest + this.intervalMs - now);
            throw new RateLimitError(`Rate limit exceeded: more than ${this.maxCalls} calls in ${this.intervalMs}ms`, {
                retryAfterMs,
            });
        }
        this.timestamps.push(now);
    }

    /** Number of calls currently counted within the active window. */
    public count(now: number = Date.now()): number {
        this.prune(now);
        return this.timestamps.length;
    }

    /** Returns a side-effect-free view of the current budget and queue. */
    public snapshot(now: number = Date.now()): RateLimiterSnapshot {
        this.prune(now);
        const oldest = this.timestamps[0];
        return {
            active: this.timestamps.length,
            remaining: Math.max(0, this.maxCalls - this.timestamps.length),
            queued: this.queue.length,
            retryAfterMs:
                this.timestamps.length >= this.maxCalls && oldest !== undefined
                    ? Math.max(0, oldest + this.intervalMs - now)
                    : 0,
        };
    }

    /**
     * Waits until capacity is available, then records the call. Useful for
     * background workers where dropping an operation is worse than delaying it.
     */
    public async wait(options: { signal?: AbortSignal } = {}): Promise<void> {
        if (this.tryAcquire()) return;
        if (this.queue.length >= this.maxQueueSize) {
            throw new RateLimitError(`Rate limiter queue is full (${this.maxQueueSize})`, {
                retryAfterMs: this.snapshot().retryAfterMs,
            });
        }

        if (options.signal?.aborted) throw this.abortError(options.signal);

        return new Promise<void>((resolve, reject) => {
            const pending: PendingAcquire = { resolve, reject, signal: options.signal };
            pending.onAbort = () => {
                const index = this.queue.indexOf(pending);
                if (index !== -1) this.queue.splice(index, 1);
                reject(this.abortError(options.signal));
                this.scheduleQueue();
            };
            options.signal?.addEventListener("abort", pending.onAbort, { once: true });
            this.queue.push(pending);
            this.scheduleQueue();
        });
    }

    private abortError(signal?: AbortSignal): Error {
        return signal?.reason instanceof Error ? signal.reason : new Error("Rate limiter wait aborted");
    }

    private scheduleQueue(): void {
        if (this.queueTimer) {
            clearTimeout(this.queueTimer);
            this.queueTimer = undefined;
        }
        this.prune(Date.now());
        while (this.queue.length > 0 && this.timestamps.length < this.maxCalls) {
            const pending = this.queue.shift();
            if (!pending) break;
            pending.signal?.removeEventListener("abort", pending.onAbort!);
            if (pending.signal?.aborted) {
                pending.reject(this.abortError(pending.signal));
                continue;
            }
            this.timestamps.push(Date.now());
            pending.resolve();
            this.prune(Date.now());
        }
        if (this.queue.length > 0) {
            const delay = Math.max(1, this.snapshot().retryAfterMs);
            this.queueTimer = setTimeout(() => {
                this.queueTimer = undefined;
                this.scheduleQueue();
            }, delay);
        }
    }

    /** Clears all recorded call timestamps. */
    public reset(): void {
        this.timestamps = [];
        this.scheduleQueue();
    }
}
