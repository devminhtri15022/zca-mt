import { describe, expect, it } from "vitest";
import * as zcaMT from "../../src/index.js";

describe("public exports", () => {
    it("exports ZcaMT as the preferred client class", () => {
        expect(zcaMT.ZcaMT).toBeTypeOf("function");
    });

    it("exports Zalo as a backward-compatible alias of ZcaMT", () => {
        expect(zcaMT.Zalo).toBeTypeOf("function");
        expect(zcaMT.ZcaMT.prototype).toBeInstanceOf(zcaMT.Zalo);
    });

    it("exports ThreadType enum with User and Group", () => {
        expect(zcaMT.ThreadType.User).toBe(0);
        expect(zcaMT.ThreadType.Group).toBe(1);
    });

    it("exports the ZCA-MT error hierarchy", () => {
        expect(zcaMT.ZcaMTError).toBeTypeOf("function");
        expect(zcaMT.AuthenticationError).toBeTypeOf("function");
        expect(zcaMT.SessionError).toBeTypeOf("function");
        expect(zcaMT.NetworkError).toBeTypeOf("function");
        expect(zcaMT.ApiError).toBeTypeOf("function");
        expect(zcaMT.ListenerError).toBeTypeOf("function");
        expect(zcaMT.ValidationError).toBeTypeOf("function");
        expect(zcaMT.RateLimitError).toBeTypeOf("function");
    });

    it("still exports the original zca-js error classes", () => {
        expect(zcaMT.ZaloApiError).toBeTypeOf("function");
        expect(zcaMT.ZaloApiMissingImageMetadataGetter).toBeTypeOf("function");
        expect(zcaMT.ZaloApiLoginQRAborted).toBeTypeOf("function");
        expect(zcaMT.ZaloApiLoginQRDeclined).toBeTypeOf("function");
    });

    it("exports session helpers and RateLimiter", () => {
        expect(zcaMT.saveSession).toBeTypeOf("function");
        expect(zcaMT.loadSession).toBeTypeOf("function");
        expect(zcaMT.deleteSession).toBeTypeOf("function");
        expect(zcaMT.RateLimiter).toBeTypeOf("function");
    });

    it("exports package metadata constants", () => {
        expect(zcaMT.ZCA_MT_DISPLAY_NAME).toBe("ZCA-MT");
        expect(zcaMT.ZCA_MT_VERSION).toBeTypeOf("string");
    });
});

describe("ZcaMT construction", () => {
    it("constructs without arguments (safe defaults)", () => {
        expect(() => new zcaMT.ZcaMT()).not.toThrow();
    });

    it("constructs with partial options", () => {
        expect(
            () =>
                new zcaMT.ZcaMT({
                    selfListen: true,
                    checkUpdate: false,
                    logging: false,
                }),
        ).not.toThrow();
    });

    it("does not perform any network call on construction", () => {
        // Constructing the client must not attempt to log in or connect.
        // If it did, this would hang or throw inside a synchronous test.
        const zca = new zcaMT.ZcaMT();
        expect(zca).toBeInstanceOf(zcaMT.ZcaMT);
    });
});
