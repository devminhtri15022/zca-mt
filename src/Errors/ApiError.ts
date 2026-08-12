import { ZcaMTError, type ErrorDetails } from "./ZcaMTError.js";

/**
 * Thrown when Zalo's servers respond but reject the request (e.g. invalid
 * parameters, permission denied, unsupported action). Distinct from
 * {@link NetworkError}, which represents transport-level failures.
 */
export class ApiError extends ZcaMTError {
    /** Zalo API error code, if the response included one. */
    public readonly apiCode?: number;

    constructor(message: string, details: Partial<Omit<ErrorDetails, "message">> & { apiCode?: number } = {}) {
        super({
            code: details.code ?? "API_ERROR",
            message,
            cause: details.cause,
            retryable: details.retryable ?? false,
        });
        this.apiCode = details.apiCode;
    }
}
