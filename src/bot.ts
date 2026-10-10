import { RateLimiter, type RateLimiterOptions } from "./rateLimiter.js";
import { RateLimitError } from "./Errors/RateLimitError.js";

export type BotCommandContext<TMessage = unknown> = {
    command: string;
    args: string[];
    rawArgs: string;
    threadId: string;
    message: TMessage;
    signal?: AbortSignal;
};

export type BotCommandHandler<TMessage = unknown> = (context: BotCommandContext<TMessage>) => unknown | Promise<unknown>;

type PendingCommand = {
    run: () => Promise<boolean>;
    resolve: (handled: boolean) => void;
    reject: (error: unknown) => void;
    signal?: AbortSignal;
    onAbort?: () => void;
};

export type CommandRouterOptions = {
    prefix?: string;
    caseSensitive?: boolean;
    rateLimit?: RateLimiterOptions;
    /** Optional budget shared by every thread handled by this router. */
    globalRateLimit?: RateLimiterOptions;
    /** Remove inactive per-thread limiters after this period. Default: 15 minutes. */
    limiterTtlMs?: number;
    /** Maximum waiting commands per thread, not counting the running command. Default: 50. */
    maxPendingPerThread?: number;
    /** Maximum commands running at the same time across all threads. Default: 20. */
    maxConcurrentCommands?: number;
    /** Maximum waiting commands across all threads. Default: 500. */
    maxPendingCommands?: number;
};

/** Small, dependency-free command router for bots built on zca-mt. */
export class CommandRouter<TMessage = unknown> {
    private readonly prefix: string;
    private readonly caseSensitive: boolean;
    private readonly rateLimitOptions: RateLimiterOptions;
    private readonly globalLimiter?: RateLimiter;
    private readonly limiterTtlMs: number;
    private readonly maxPendingPerThread: number;
    private readonly maxConcurrentCommands: number;
    private readonly maxPendingCommands: number;
    private readonly commands = new Map<string, BotCommandHandler<TMessage>>();
    private readonly aliases = new Map<string, string>();
    private readonly limiters = new Map<string, RateLimiter>();
    private readonly limiterLastUsed = new Map<string, number>();
    private readonly queues = new Map<string, PendingCommand[]>();
    private readonly activeThreads = new Set<string>();
    private activeCommands = 0;
    private queuedCommandCount = 0;
    private readonly idleWaiters = new Set<() => void>();
    private closed = false;

    constructor(options: CommandRouterOptions = {}) {
        this.prefix = options.prefix ?? "!";
        this.caseSensitive = options.caseSensitive ?? false;
        this.rateLimitOptions = options.rateLimit ?? { maxCalls: 5, intervalMs: 60_000 };
        this.globalLimiter = options.globalRateLimit ? new RateLimiter(options.globalRateLimit) : undefined;
        this.limiterTtlMs = options.limiterTtlMs ?? 15 * 60_000;
        this.maxPendingPerThread = options.maxPendingPerThread ?? 50;
        this.maxConcurrentCommands = options.maxConcurrentCommands ?? 20;
        this.maxPendingCommands = options.maxPendingCommands ?? 500;
        if (!this.prefix) throw new RangeError("CommandRouter: prefix cannot be empty");
        if (!Number.isFinite(this.limiterTtlMs) || this.limiterTtlMs <= 0) {
            throw new RangeError("CommandRouter: limiterTtlMs must be positive");
        }
        if (!Number.isInteger(this.maxPendingPerThread) || this.maxPendingPerThread < 0) {
            throw new RangeError("CommandRouter: maxPendingPerThread must be a non-negative integer");
        }
        if (!Number.isInteger(this.maxConcurrentCommands) || this.maxConcurrentCommands <= 0) {
            throw new RangeError("CommandRouter: maxConcurrentCommands must be a positive integer");
        }
        if (!Number.isInteger(this.maxPendingCommands) || this.maxPendingCommands < 0) {
            throw new RangeError("CommandRouter: maxPendingCommands must be a non-negative integer");
        }
    }

    public register(command: string, handler: BotCommandHandler<TMessage>): this {
        const normalized = this.normalize(command.trim());
        if (!normalized || /\s/.test(normalized)) throw new TypeError("CommandRouter: command must be one word");
        if (this.commands.has(normalized) || this.aliases.has(normalized)) {
            throw new Error(`CommandRouter: duplicate command '${command}'`);
        }
        this.commands.set(normalized, handler);
        return this;
    }

    public registerMany(entries: Array<[string, BotCommandHandler<TMessage>]>): this {
        for (const [command, handler] of entries) this.register(command, handler);
        return this;
    }

    public alias(name: string, target: string): this {
        const alias = this.normalize(name.trim());
        const command = this.normalize(target.trim());
        if (!alias || !command || /\s/.test(alias) || /\s/.test(command)) {
            throw new TypeError("CommandRouter: aliases must be single-word names");
        }
        if (this.commands.has(alias) || this.aliases.has(alias)) {
            throw new Error(`CommandRouter: duplicate alias '${name}'`);
        }
        this.aliases.set(alias, command);
        return this;
    }

    public unregister(command: string): boolean {
        const normalized = this.normalize(command);
        const deleted = this.commands.delete(normalized);
        this.aliases.delete(normalized);
        for (const [alias, target] of this.aliases) {
            if (target === normalized) this.aliases.delete(alias);
        }
        return deleted;
    }

    public list(): string[] {
        return [...this.commands.keys(), ...this.aliases.keys()].sort();
    }

    public stats(): {
        commands: number;
        aliases: number;
        activeLimiters: number;
        queuedThreads: number;
        queuedCommands: number;
        activeCommands: number;
        activeThreads: number;
        closed: boolean;
    } {
        return {
            commands: this.commands.size,
            aliases: this.aliases.size,
            activeLimiters: this.limiters.size,
            queuedThreads: [...this.queues.values()].filter((queue) => queue.length > 0).length,
            queuedCommands: this.queuedCommandCount,
            activeCommands: this.activeCommands,
            activeThreads: this.activeThreads.size,
            closed: this.closed,
        };
    }

    public async dispatch(input: {
        text: string;
        threadId: string;
        message: TMessage;
        signal?: AbortSignal;
    }): Promise<boolean> {
        if (!input.text.startsWith(this.prefix)) return false;
        const body = input.text.slice(this.prefix.length).trim();
        if (!body) return false;
        const separator = body.search(/\s/);
        const commandName = separator === -1 ? body : body.slice(0, separator);
        const resolvedName = this.aliases.get(this.normalize(commandName)) ?? commandName;
        const command = this.normalize(resolvedName);
        const handler = this.commands.get(command);
        if (!handler) return false;

        if (this.closed) throw new Error("CommandRouter is closed");
        if (input.signal?.aborted) throw this.abortError(input.signal);

        const rawArgs = separator === -1 ? "" : body.slice(separator).trim();
        this.pruneLimiters();
        const threadId = input.threadId;
        const queue = this.queues.get(threadId) ?? [];
        const willWait =
            this.activeThreads.has(threadId) || queue.length > 0 || this.activeCommands >= this.maxConcurrentCommands;
        if (willWait && queue.length >= this.maxPendingPerThread) {
            throw new RateLimitError(`CommandRouter queue is full for thread '${threadId}'`, {
                code: "BOT_COMMAND_QUEUE_FULL",
            });
        }
        if (willWait && this.queuedCommandCount >= this.maxPendingCommands) {
            throw new RateLimitError("CommandRouter global queue is full", {
                code: "BOT_COMMAND_QUEUE_FULL",
            });
        }
        this.queues.set(threadId, queue);
        this.limiterFor(threadId);

        return new Promise<boolean>((resolve, reject) => {
            const pending: PendingCommand = {
                signal: input.signal,
                resolve,
                reject,
                run: async () => {
                    const limiter = this.limiterFor(threadId);
                    await this.globalLimiter?.wait({ signal: input.signal });
                    await limiter.wait({ signal: input.signal });
                    if (input.signal?.aborted) throw this.abortError(input.signal);
                    await handler({
                        command,
                        args: rawArgs ? rawArgs.split(/\s+/) : [],
                        rawArgs,
                        threadId,
                        message: input.message,
                        signal: input.signal,
                    });
                    return true;
                },
            };
            pending.onAbort = () => {
                const pendingQueue = this.queues.get(threadId);
                if (!pendingQueue) return;
                const index = pendingQueue.indexOf(pending);
                if (index < 0) return;
                pendingQueue.splice(index, 1);
                this.queuedCommandCount--;
                reject(this.abortError(input.signal));
                this.cleanupThread(threadId);
            };
            input.signal?.addEventListener("abort", pending.onAbort, { once: true });
            queue.push(pending);
            this.queuedCommandCount++;
            void this.runNext(threadId);
        });
    }

    private abortError(signal?: AbortSignal): Error {
        return signal?.reason instanceof Error ? signal.reason : new Error("Command dispatch aborted");
    }

    private async runNext(threadId: string): Promise<void> {
        if (this.activeThreads.has(threadId) || this.activeCommands >= this.maxConcurrentCommands) return;
        const queue = this.queues.get(threadId);
        const pending = queue?.shift();
        if (!pending) {
            this.cleanupThread(threadId);
            return;
        }
        this.queuedCommandCount--;

        pending.signal?.removeEventListener("abort", pending.onAbort!);
        if (pending.signal?.aborted) {
            pending.reject(this.abortError(pending.signal));
            void this.runNext(threadId);
            return;
        }

        this.activeThreads.add(threadId);
        this.activeCommands++;
        try {
            pending.resolve(await pending.run());
        } catch (error) {
            pending.reject(error);
        } finally {
            this.activeThreads.delete(threadId);
            this.activeCommands--;
            if (this.activeCommands === 0) {
                for (const resolve of this.idleWaiters) resolve();
                this.idleWaiters.clear();
            }
            this.cleanupThread(threadId);
            for (const waitingThreadId of this.queues.keys()) void this.runNext(waitingThreadId);
        }
    }

    private cleanupThread(threadId: string): void {
        const queue = this.queues.get(threadId);
        if (queue?.length === 0 && !this.activeThreads.has(threadId)) this.queues.delete(threadId);
    }

    public close(): void {
        if (this.closed) return;
        this.closed = true;
        for (const [threadId, queue] of this.queues) {
            const pendingCommands = queue.splice(0);
            this.queuedCommandCount -= pendingCommands.length;
            for (const pending of pendingCommands) {
                pending.signal?.removeEventListener("abort", pending.onAbort!);
                pending.reject(new Error("CommandRouter closed before command execution"));
            }
            this.cleanupThread(threadId);
        }
    }

    /** Wait for active handlers to finish; false indicates the timeout elapsed. */
    public async drain(timeoutMs: number = 10_000): Promise<boolean> {
        if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
            throw new RangeError("CommandRouter: drain timeout must be non-negative");
        }
        if (this.activeCommands === 0) return true;
        return new Promise<boolean>((resolve) => {
            const onIdle = () => finish(true);
            const timer = setTimeout(() => finish(false), timeoutMs);
            const finish = (drained: boolean) => {
                clearTimeout(timer);
                this.idleWaiters.delete(onIdle);
                resolve(drained);
            };
            this.idleWaiters.add(onIdle);
        });
    }

    private normalize(command: string): string {
        return this.caseSensitive ? command : command.toLowerCase();
    }

    private limiterFor(threadId: string): RateLimiter {
        let limiter = this.limiters.get(threadId);
        if (!limiter) {
            limiter = new RateLimiter(this.rateLimitOptions);
            this.limiters.set(threadId, limiter);
        }
        this.limiterLastUsed.set(threadId, Date.now());
        return limiter;
    }

    public pruneLimiters(now: number = Date.now()): number {
        let removed = 0;
        for (const [threadId, lastUsed] of this.limiterLastUsed) {
            const limiter = this.limiters.get(threadId);
            if (
                now - lastUsed >= this.limiterTtlMs &&
                limiter?.snapshot(now).queued === 0 &&
                !this.activeThreads.has(threadId) &&
                !this.queues.has(threadId)
            ) {
                this.limiterLastUsed.delete(threadId);
                this.limiters.delete(threadId);
                removed++;
            }
        }
        return removed;
    }
}
