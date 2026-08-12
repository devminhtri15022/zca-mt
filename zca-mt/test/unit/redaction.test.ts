import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { redactSensitive, logger } from "../../src/utils.js";

describe("redactSensitive", () => {
    it("masks top-level sensitive fields", () => {
        const input = { cookie: "abc123", token: "def456", other: "safe" };
        const result = redactSensitive(input) as Record<string, unknown>;

        expect(result.cookie).toBe("[REDACTED]");
        expect(result.token).toBe("[REDACTED]");
        expect(result.other).toBe("safe");
    });

    it("masks nested sensitive fields", () => {
        const input = { user: { imei: "should-hide", name: "should-stay" } };
        const result = redactSensitive(input) as { user: Record<string, unknown> };

        expect(result.user.imei).toBe("[REDACTED]");
        expect(result.user.name).toBe("should-stay");
    });

    it("matches sensitive keys case-insensitively and as substrings", () => {
        const input = { Authorization: "x", sessionId: "y", secretKey: "z" };
        const result = redactSensitive(input) as Record<string, unknown>;

        expect(result.Authorization).toBe("[REDACTED]");
        expect(result.sessionId).toBe("[REDACTED]");
        expect(result.secretKey).toBe("[REDACTED]");
    });

    it("redacts values inside arrays", () => {
        const input = [{ cookie: "a" }, { cookie: "b" }];
        const result = redactSensitive(input) as Record<string, unknown>[];

        expect(result[0].cookie).toBe("[REDACTED]");
        expect(result[1].cookie).toBe("[REDACTED]");
    });

    it("masks objects that look like a CookieJar outright", () => {
        class CookieJar {
            secretField = "abc";
        }
        const result = redactSensitive(new CookieJar());
        expect(result).toBe("[REDACTED]");
    });

    it("leaves non-sensitive primitive values untouched", () => {
        expect(redactSensitive("hello")).toBe("hello");
        expect(redactSensitive(42)).toBe(42);
        expect(redactSensitive(null)).toBe(null);
    });
});

describe("logger", () => {
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        logSpy.mockRestore();
    });

    it("does nothing when logging is disabled", () => {
        const log = logger({ options: { logging: false } });
        log.info("hello", { cookie: "secret" });
        expect(logSpy).not.toHaveBeenCalled();
    });

    it("redacts sensitive fields before printing when logging is enabled", () => {
        const log = logger({ options: { logging: true } });
        log.error("failed", { cookie: "super-secret-cookie-value" });

        expect(logSpy).toHaveBeenCalledTimes(1);
        const printedArgs = logSpy.mock.calls[0];
        const printedPayload = JSON.stringify(printedArgs);

        expect(printedPayload).not.toContain("super-secret-cookie-value");
        expect(printedPayload).toContain("[REDACTED]");
    });
});
