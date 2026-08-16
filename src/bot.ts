import { RateLimiter, type RateLimiterOptions } from "./rateLimiter.js";

export type BotCommandContext<TMessage = unknown> = {
    command: string;
    args: string[];
    rawArgs: string;
    threadId: string;
    message: TMessage;
};

export type BotCommandHandler<TMessage = unknown> = (context: BotCommandContext<TMessage>) => unknown | Promise<unknown>;

export type CommandRouterOptions = {
    prefix?: string;
    caseSensitive?: boolean;
    rateLimit?: RateLimiterOptions;
    /** Optional budget shared by every thread handled by this router. */
    globalRateLimit?: RateLimiterOptions;
    /** Remove inactive per-thread limiters after this period. Default: 15 minutes. */
    limiterTtlMs?: number;
};

/** Small, dependency-free command router for bots built on zca-mt. */
export class CommandRouter<TMessage = unknown> {
    private readonly prefix: string;
    private readonly caseSensitive: boolean;
    private readonly rateLimitOptions: RateLimiterOptions;
    private readonly globalLimiter?: RateLimiter;
    private readonly limiterTtlMs: number;
    private readonly commands = new Map<string, BotCommandHandler<TMessage>>();
    private readonly limiters = new Map<string, RateLimiter>();
    private readonly limiterLastUsed = new Map<string, number>();

    constructor(options: CommandRouterOptions = {}) {
        this.prefix = options.prefix ?? "!";
        this.caseSensitive = options.caseSensitive ?? false;
        this.rateLimitOptions = options.rateLimit ?? { maxCalls: 5, intervalMs: 60_000 };
        this.globalLimiter = options.globalRateLimit ? new RateLimiter(options.globalRateLimit) : undefined;
        this.limiterTtlMs = options.limiterTtlMs ?? 15 * 60_000;
        if (!this.prefix) throw new RangeError("CommandRouter: prefix cannot be empty");
        if (this.limiterTtlMs <= 0) throw new RangeError("CommandRouter: limiterTtlMs must be positive");
    }

    public register(command: string, handler: BotCommandHandler<TMessage>): this {
        const normalized = this.normalize(command.trim());
        if (!normalized || /\s/.test(normalized)) throw new TypeError("CommandRouter: command must be one word");
        if (this.commands.has(normalized)) throw new Error(`CommandRouter: duplicate command '${command}'`);
        this.commands.set(normalized, handler);
        return this;
    }

    public unregister(command: string): boolean {
        return this.commands.delete(this.normalize(command));
    }

    public list(): string[] {
        return [...this.commands.keys()].sort();
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
        const command = this.normalize(separator === -1 ? body : body.slice(0, separator));
        const handler = this.commands.get(command);
        if (!handler) return false;

        const rawArgs = separator === -1 ? "" : body.slice(separator).trim();
        this.pruneLimiters();
        const limiter = this.limiterFor(input.threadId);
        await this.globalLimiter?.wait({ signal: input.signal });
        await limiter.wait({ signal: input.signal });
        await handler({
            command,
            args: rawArgs ? rawArgs.split(/\s+/) : [],
            rawArgs,
            threadId: input.threadId,
            message: input.message,
        });
        return true;
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
            if (now - lastUsed >= this.limiterTtlMs && limiter?.snapshot(now).queued === 0) {
                this.limiterLastUsed.delete(threadId);
                this.limiters.delete(threadId);
                removed++;
            }
        }
        return removed;
    }
}
