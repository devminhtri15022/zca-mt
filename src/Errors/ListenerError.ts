import { ZcaMTError, type ErrorDetails } from "./ZcaMTError.js";

/**
 * Thrown for realtime-listener failures (WebSocket connect/parse/decode
 * errors). Listener errors are emitted via the `error` event and should
 * never crash the host process by themselves.
 */
export class ListenerError extends ZcaMTError {
    constructor(message: string, details: Partial<Omit<ErrorDetails, "message">> = {}) {
        super({
            code: details.code ?? "LISTENER_ERROR",
            message,
            cause: details.cause,
            retryable: details.retryable ?? true,
        });
    }
}
