import { ZcaMTError, type ErrorDetails } from "./ZcaMTError.js";

/**
 * Thrown for transport-level failures: timeouts, DNS errors, connection
 * resets, or other fetch/WebSocket failures that are not an API-level
 * rejection from Zalo's servers.
 */
export class NetworkError extends ZcaMTError {
    constructor(message: string, details: Partial<Omit<ErrorDetails, "message">> = {}) {
        super({
            code: details.code ?? "NETWORK_ERROR",
            message,
            cause: details.cause,
            retryable: details.retryable ?? true,
        });
    }
}
