import { describe, expect, it, vi } from "vitest";
import { retryIdempotent } from "../../src/retry.js";

describe("retryIdempotent", () => {
    it("retries failures and returns the successful result", async () => {
        const operation = vi.fn().mockRejectedValueOnce(new Error("temporary")).mockResolvedValue("ok");
        await expect(
            retryIdempotent(operation, { idempotent: true, attempts: 2, baseDelayMs: 0, jitter: 0 }),
        ).resolves.toBe("ok");
        expect(operation).toHaveBeenCalledTimes(2);
    });

    it("honors shouldRetry", async () => {
        const operation = vi.fn().mockRejectedValue(new Error("permanent"));
        await expect(
            retryIdempotent(operation, { idempotent: true, attempts: 3, shouldRetry: () => false }),
        ).rejects.toThrow("permanent");
        expect(operation).toHaveBeenCalledTimes(1);
    });

    it("retries transient network errors by default", async () => {
        const operation = vi.fn().mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValue("ok");
        await expect(retryIdempotent(operation, { idempotent: true, attempts: 2, baseDelayMs: 0, jitter: 0 })).resolves.toBe(
            "ok",
        );
        expect(operation).toHaveBeenCalledTimes(2);
    });

    it("honors server retry-after hints within the configured maximum", async () => {
        vi.useFakeTimers();
        try {
            const operation = vi.fn().mockRejectedValueOnce({ retryable: true, retryAfterMs: 500 }).mockResolvedValue("ok");
            const retry = vi.fn();
            const result = retryIdempotent(operation, {
                idempotent: true,
                attempts: 2,
                baseDelayMs: 10,
                maxDelayMs: 300,
                jitter: 0,
                onRetry: retry,
            });
            await Promise.resolve();
            expect(retry).toHaveBeenCalledWith(expect.objectContaining({ delayMs: 300 }));
            await vi.advanceTimersByTimeAsync(300);
            await expect(result).resolves.toBe("ok");
        } finally {
            vi.useRealTimers();
        }
    });
});
