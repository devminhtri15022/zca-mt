import { logger } from "./utils.js";
import { ZCA_MT_VERSION } from "./meta.js";
import type { ContextBase } from "./context.js";

let bannerPrinted = false;

/**
 * Prints a one-time branding banner when logging is enabled, so anyone
 * watching the console immediately sees this is ZCA-MT,
 * not the upstream package directly.
 *
 * Shown once per process, before the first `checkUpdate` log line.
 */
export function printBanner(ctx: ContextBase) {
    if (bannerPrinted) return;
    bannerPrinted = true;

    const log = logger(ctx);
    log.info(`@zcamt v${ZCA_MT_VERSION} — unofficial Zalo API`);
}

/** Test-only helper to reset the one-time banner guard between test runs. */
export function __resetBannerForTests() {
    bannerPrinted = false;
}
