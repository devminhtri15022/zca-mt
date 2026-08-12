/**
 * examples/login-qr.ts
 *
 * Minimal QR login example for ZCA-MT.
 *
 * IMPORTANT:
 * - The QR code is only ever written to a local file/terminal on your own
 *   machine; ZCA-MT never uploads it anywhere.
 * - This example intentionally does NOT save cookies/session data anywhere.
 *   See examples/send-message.ts or src/session.ts if you want to opt in to
 *   session persistence yourself.
 * - ZCA-MT is an unofficial API. Using it can result in your account being
 *   rate-limited or locked by Zalo. Only use it with an account you own or
 *   are explicitly authorized to manage.
 */
import { ZcaMT } from "../src/index.js";

const zca = new ZcaMT({
    selfListen: false,
    checkUpdate: true,
    logging: true,
});

console.log("Scan the QR code with the Zalo mobile app to log in...");

const api = await zca.loginQR();

// Never log cookies/tokens. `fetchAccountInfo` only returns public profile
// fields, so it's safe to print for a quick sanity check.
const me = await api.fetchAccountInfo();
console.log("Logged in as:", me);
