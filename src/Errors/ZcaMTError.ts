/**
 * Structured details attached to every zca-mt error.
 */
export interface ErrorDetails {
    /** Stable machine-readable error code, e.g. "AUTH_FAILED". */
    code: string;
    /** Human-readable message. */
    message: string;
    /** Original error / value that caused this error, if any. */
    cause?: unknown;
    /** Whether the operation that produced this error can be safely retried. */
    retryable?: boolean;
}

/**
 * Base class for every error thrown by zca-mt's own code (as opposed to
 * errors re-exported from the original `zca-js` project, such as
 * `ZaloApiError`).
 */
export class ZcaMTError extends Error {
    public readonly code: string;
    public readonly cause?: unknown;
    public readonly retryable: boolean;

    constructor(details: ErrorDetails) {
        super(details.message);
        this.name = new.target.name;
        this.code = details.code;
        this.cause = details.cause;
        this.retryable = details.retryable ?? false;

        // Maintain proper stack trace where available (V8).
        if (typeof Error.captureStackTrace === "function") {
            Error.captureStackTrace(this, new.target);
        }
    }

    public toJSON(): ErrorDetails & { name: string } {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            retryable: this.retryable,
            // `cause` is intentionally omitted from JSON by default since it may
            // wrap sensitive/verbose data (e.g. raw network responses).
        };
    }
}
