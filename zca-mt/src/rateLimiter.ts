import { RateLimitError } from "./Errors/RateLimitError.js";

export type RateLimiterOptions = {
    /** Maximum number of calls allowed within `intervalMs`. Default: 20. */
    maxCalls?: number;
    /** Length of the sliding window in milliseconds. Default: 60_000 (1 minute). */
    intervalMs?: number;
};

/**
 * A minimal in-memory sliding-window rate limiter.
 *
 * ZCA-MT does not enforce this automatically on every API call — it is
 * provided as an opt-in building block so bots built on top of ZCA-MT can
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
    private timestamps: number[] = [];

    constructor(options: RateLimiterOptions = {}) {
        this.maxCalls = options.maxCalls ?? 20;
        this.intervalMs = options.intervalMs ?? 60_000;

        if (this.maxCalls <= 0) {
            throw new RangeError("RateLimiter: maxCalls must be a positive number");
        }
        if (this.intervalMs <= 0) {
            throw new RangeError("RateLimiter: intervalMs must be a positive number");
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
        if (this.timestamps.length >= this.maxCalls) return false;
        this.timestamps.push(now);
        return true;
    }

    /**
     * Throws {@link RateLimitError} if the caller is currently over budget.
     */
    public acquire(now: number = Date.now()): void {
        this.prune(now);
        if (this.timestamps.length >= this.maxCalls) {
            const oldest = this.timestamps[0];
            const retryAfterMs = Math.max(0, oldest + this.intervalMs - now);
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

    /** Clears all recorded call timestamps. */
    public reset(): void {
        this.timestamps = [];
    }
}
