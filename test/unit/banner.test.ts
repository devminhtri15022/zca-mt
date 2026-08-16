import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { printBanner, __resetBannerForTests } from "../../src/banner.js";

describe("printBanner", () => {
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        __resetBannerForTests();
        logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        logSpy.mockRestore();
    });

    it("prints a banner mentioning @zca-mt when logging is enabled", () => {
        printBanner({ options: { logging: true } } as never);

        expect(logSpy).toHaveBeenCalledTimes(1);
        const printed = logSpy.mock.calls[0].join(" ");
        expect(printed).toContain("@zca-mt");
    });

    it("does nothing when logging is disabled", () => {
        printBanner({ options: { logging: false } } as never);
        expect(logSpy).not.toHaveBeenCalled();
    });

    it("only prints once per process even if called multiple times", () => {
        printBanner({ options: { logging: true } } as never);
        printBanner({ options: { logging: true } } as never);
        printBanner({ options: { logging: true } } as never);

        expect(logSpy).toHaveBeenCalledTimes(1);
    });
});
