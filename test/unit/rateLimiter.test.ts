import { describe, expect, it } from "vitest";
import { RateLimiter } from "../../src/rateLimiter.js";
import { RateLimitError } from "../../src/Errors/RateLimitError.js";

describe("RateLimiter", () => {
    it("allows calls under the configured budget", () => {
        const limiter = new RateLimiter({ maxCalls: 3, intervalMs: 1000 });
        const now = 0;

        expect(limiter.tryAcquire(now)).toBe(true);
        expect(limiter.tryAcquire(now)).toBe(true);
        expect(limiter.tryAcquire(now)).toBe(true);
        expect(limiter.count(now)).toBe(3);
    });

    it("rejects calls over the configured budget (non-throwing variant)", () => {
        const limiter = new RateLimiter({ maxCalls: 2, intervalMs: 1000 });
        const now = 0;

        expect(limiter.tryAcquire(now)).toBe(true);
        expect(limiter.tryAcquire(now)).toBe(true);
        expect(limiter.tryAcquire(now)).toBe(false);
    });

    it("throws RateLimitError from acquire() when over budget", () => {
        const limiter = new RateLimiter({ maxCalls: 1, intervalMs: 1000 });
        const now = 0;

        limiter.acquire(now);
        expect(() => limiter.acquire(now)).toThrow(RateLimitError);
    });

    it("frees up budget once the sliding window passes", () => {
        const limiter = new RateLimiter({ maxCalls: 1, intervalMs: 1000 });

        expect(limiter.tryAcquire(0)).toBe(true);
        expect(limiter.tryAcquire(500)).toBe(false);
        expect(limiter.tryAcquire(1001)).toBe(true);
    });

    it("reset() clears recorded calls", () => {
        const limiter = new RateLimiter({ maxCalls: 1, intervalMs: 1000 });
        limiter.tryAcquire(0);
        expect(limiter.count(0)).toBe(1);

        limiter.reset();
        expect(limiter.count(0)).toBe(0);
    });

    it("rejects non-positive configuration", () => {
        expect(() => new RateLimiter({ maxCalls: 0 })).toThrow(RangeError);
        expect(() => new RateLimiter({ intervalMs: 0 })).toThrow(RangeError);
    });
});
