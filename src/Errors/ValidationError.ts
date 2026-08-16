import { ZcaMTError, type ErrorDetails } from "./ZcaMTError.js";

/**
 * Thrown when input passed to a zca-mt function fails local validation
 * before any network request is made (e.g. missing required option, wrong
 * type, out-of-range value).
 */
export class ValidationError extends ZcaMTError {
    /** Name of the field/option that failed validation, if applicable. */
    public readonly field?: string;

    constructor(message: string, details: Partial<Omit<ErrorDetails, "message">> & { field?: string } = {}) {
        super({
            code: details.code ?? "VALIDATION_ERROR",
            message,
            cause: details.cause,
            retryable: details.retryable ?? false,
        });
        this.field = details.field;
    }
}
