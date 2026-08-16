export type RetryContext = {
    attempt: number;
    delayMs: number;
    error: unknown;
};

export type RetryOptions = {
    /** Explicit guard: this helper must not be used for non-idempotent writes. */
    idempotent: true;
    attempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    jitter?: number;
    signal?: AbortSignal;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
    onRetry?: (context: RetryContext) => void;
};

/** Retries an explicitly idempotent operation with exponential backoff. */
export async function retryIdempotent<T>(operation: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
    const attempts = options.attempts ?? 3;
    const baseDelayMs = options.baseDelayMs ?? 250;
    const maxDelayMs = options.maxDelayMs ?? 5_000;
    const jitter = options.jitter ?? 0.2;
    if (!Number.isInteger(attempts) || attempts < 1) throw new RangeError("attempts must be a positive integer");
    if (baseDelayMs < 0 || maxDelayMs < baseDelayMs) throw new RangeError("invalid retry delay range");
    if (jitter < 0 || jitter > 1) throw new RangeError("jitter must be between 0 and 1");

    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        if (options.signal?.aborted) throw abortError(options.signal);
        try {
            return await operation(attempt);
        } catch (error) {
            lastError = error;
            if (attempt === attempts || options.shouldRetry?.(error, attempt) === false) throw error;
            const rawDelay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
            const spread = rawDelay * jitter;
            const delayMs = Math.max(0, Math.round(rawDelay - spread + Math.random() * spread * 2));
            options.onRetry?.({ attempt, delayMs, error });
            await abortableDelay(delayMs, options.signal);
        }
    }
    throw lastError;
}

function abortError(signal: AbortSignal): Error {
    return signal.reason instanceof Error ? signal.reason : new Error("Retry aborted");
}

function abortableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortError(signal));
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(timer);
            reject(abortError(signal!));
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, delayMs);
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}
