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
});
