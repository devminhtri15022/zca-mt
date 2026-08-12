import { ZcaMTError, type ErrorDetails } from "./ZcaMTError.js";

/**
 * Thrown by ZCA-MT's own client-side {@link "../rateLimiter.js".RateLimiter}
 * when a caller exceeds the configured request budget. This is a local,
 * defensive guard — it is not a report of a rate limit enforced by Zalo's
 * servers.
 */
export class RateLimitError extends ZcaMTError {
    /** Milliseconds until the caller may retry. */
    public readonly retryAfterMs?: number;

    constructor(message: string, details: Partial<Omit<ErrorDetails, "message">> & { retryAfterMs?: number } = {}) {
        super({
            code: details.code ?? "RATE_LIMITED",
            message,
            cause: details.cause,
            retryable: details.retryable ?? true,
        });
        this.retryAfterMs = details.retryAfterMs;
    }
}
