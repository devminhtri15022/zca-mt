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

function retryAfterHintMs(error: unknown): number {
    if (typeof error !== "object" || error === null) return 0;
    const candidate = error as {
        retryAfterMs?: unknown;
        response?: { headers?: { get?: (name: string) => string | null } };
    };
    if (typeof candidate.retryAfterMs === "number" && Number.isFinite(candidate.retryAfterMs)) {
        return Math.max(0, candidate.retryAfterMs);
    }
    const header = candidate.response?.headers?.get?.("retry-after");
    if (!header) return 0;
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(header);
    return Number.isNaN(date) ? 0 : Math.max(0, date - Date.now());
}

function defaultShouldRetry(error: unknown): boolean {
    if (typeof error === "object" && error !== null) {
        const candidate = error as { retryable?: boolean; code?: string; status?: number };
        if (candidate.retryable === false) return false;
        if (typeof candidate.code === "string" && /auth|validation|bad request|not found|invalid/i.test(candidate.code)) {
            return false;
        }
        if (typeof candidate.status === "number" && (candidate.status >= 400 && candidate.status < 500 && candidate.status !== 408 && candidate.status !== 429)) {
            return false;
        }
    }
    return true;
}

/** Retries an explicitly idempotent operation with exponential backoff. */
export async function retryIdempotent<T>(operation: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
    const attempts = options.attempts ?? 3;
    const baseDelayMs = options.baseDelayMs ?? 250;
    const maxDelayMs = options.maxDelayMs ?? 5_000;
    const jitter = options.jitter ?? 0.2;
    if (!Number.isInteger(attempts) || attempts < 1) throw new RangeError("attempts must be a positive integer");
    if (
        !Number.isFinite(baseDelayMs) ||
        !Number.isFinite(maxDelayMs) ||
        baseDelayMs < 0 ||
        maxDelayMs < baseDelayMs
    ) {
        throw new RangeError("invalid retry delay range");
    }
    if (!Number.isFinite(jitter) || jitter < 0 || jitter > 1) {
        throw new RangeError("jitter must be between 0 and 1");
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        if (options.signal?.aborted) throw abortError(options.signal);
        try {
            return await operation(attempt);
        } catch (error) {
            lastError = error;
            const shouldRetry = options.shouldRetry ? options.shouldRetry(error, attempt) : defaultShouldRetry(error);
            if (attempt === attempts || shouldRetry === false) throw error;
            const rawDelay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
            const backoffDelay = Math.round(rawDelay * (1 - jitter + Math.random() * jitter * 2));
            const delayMs = Math.min(maxDelayMs, Math.max(backoffDelay, retryAfterHintMs(error)));
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
