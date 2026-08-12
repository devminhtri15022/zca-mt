import { ZcaMTError, type ErrorDetails } from "./ZcaMTError.js";

/**
 * Thrown when a stored session (cookie/imei/userAgent bundle) cannot be
 * read, parsed, restored, or validated.
 */
export class SessionError extends ZcaMTError {
    constructor(message: string, details: Partial<Omit<ErrorDetails, "message">> = {}) {
        super({
            code: details.code ?? "SESSION_INVALID",
            message,
            cause: details.cause,
            retryable: details.retryable ?? false,
        });
    }
}
