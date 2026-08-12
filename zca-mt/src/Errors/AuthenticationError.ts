import { ZcaMTError, type ErrorDetails } from "./ZcaMTError.js";

/**
 * Thrown when login (QR or cookie-based) fails, is declined, or is aborted.
 * Never carries cookie/token/imei values in its message.
 */
export class AuthenticationError extends ZcaMTError {
    constructor(message: string, details: Partial<Omit<ErrorDetails, "message">> = {}) {
        super({
            code: details.code ?? "AUTH_FAILED",
            message,
            cause: details.cause,
            retryable: details.retryable ?? false,
        });
    }
}
