import { describe, expect, it } from "vitest";
import {
    ZcaMTError,
    AuthenticationError,
    SessionError,
    NetworkError,
    ApiError,
    ListenerError,
    ValidationError,
    RateLimitError,
} from "../../src/Errors/index.js";

describe("ZcaMTError base class", () => {
    it("carries code, message, cause and retryable", () => {
        const cause = new Error("underlying");
        const err = new ZcaMTError({ code: "X", message: "boom", cause, retryable: true });

        expect(err).toBeInstanceOf(Error);
        expect(err.code).toBe("X");
        expect(err.message).toBe("boom");
        expect(err.cause).toBe(cause);
        expect(err.retryable).toBe(true);
    });

    it("defaults retryable to false when omitted", () => {
        const err = new ZcaMTError({ code: "X", message: "boom" });
        expect(err.retryable).toBe(false);
    });

    it("toJSON() never includes the raw cause", () => {
        const err = new ZcaMTError({ code: "X", message: "boom", cause: { cookie: "secret" } });
        const json = err.toJSON();
        expect(json).not.toHaveProperty("cause");
        expect(json.code).toBe("X");
    });
});

describe("error subclasses", () => {
    it.each([
        [AuthenticationError, "AUTH_FAILED"],
        [SessionError, "SESSION_INVALID"],
        [NetworkError, "NETWORK_ERROR"],
        [ApiError, "API_ERROR"],
        [ListenerError, "LISTENER_ERROR"],
        [ValidationError, "VALIDATION_ERROR"],
        [RateLimitError, "RATE_LIMITED"],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ])("%s has the expected default code", (ErrorClass: any, expectedCode: string) => {
        const err = new ErrorClass("something went wrong");
        expect(err).toBeInstanceOf(ZcaMTError);
        expect(err.code).toBe(expectedCode);
        expect(err.message).toBe("something went wrong");
    });

    it("allows overriding the default code", () => {
        const err = new ApiError("denied", { code: "PERMISSION_DENIED", apiCode: 403 });
        expect(err.code).toBe("PERMISSION_DENIED");
        expect(err.apiCode).toBe(403);
    });

    it("RateLimitError carries retryAfterMs", () => {
        const err = new RateLimitError("slow down", { retryAfterMs: 1500 });
        expect(err.retryAfterMs).toBe(1500);
        expect(err.retryable).toBe(true);
    });

    it("ValidationError carries the offending field name", () => {
        const err = new ValidationError("bad width", { field: "width" });
        expect(err.field).toBe("width");
        expect(err.retryable).toBe(false);
    });
});
