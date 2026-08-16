import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import type { Credentials } from "./zalo.js";
import { SessionError } from "./Errors/SessionError.js";

/**
 * zca-mt does not persist login sessions automatically. Session persistence
 * is entirely opt-in and left to the application, because a saved session
 * file is equivalent to a valid, logged-in cookie for the account.
 *
 * These helpers exist only to make the "opt-in and store it safely" path
 * easy to do correctly:
 *   - the file is written with owner-only permissions (0600) where the
 *     platform supports it,
 *   - the directory is created if missing,
 *   - callers are responsible for adding the path to `.gitignore` (the
 *     zca-mt-generated `.gitignore` template already excludes common
 *     session file names).
 *
 * zca-mt never calls these functions on its own; nothing is written to disk
 * unless your application explicitly calls {@link saveSession}.
 */

export type SavedSession = Credentials;

export type SessionLoadOptions = {
    /** Refuse unexpectedly large files. Default: 1 MiB. */
    maxBytes?: number;
};

type EncryptedSessionFile = {
    format: "zca-mt-session";
    version: 1;
    algorithm: "aes-256-gcm";
    salt: string;
    iv: string;
    authTag: string;
    ciphertext: string;
};

function assertPassphrase(passphrase: string): void {
    if (passphrase.length < 12) throw new RangeError("Session passphrase must contain at least 12 characters");
}

function atomicWrite(filePath: string, contents: string): void {
    const dir = path.dirname(filePath);
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
        fs.writeFileSync(tempPath, contents, { mode: 0o600, flag: "wx" });
        fs.renameSync(tempPath, filePath);
    } catch (cause) {
        try {
            fs.unlinkSync(tempPath);
        } catch {
            // The temporary file may not have been created.
        }
        throw new SessionError(`Unable to save session file: ${filePath}`, {
            code: "SESSION_WRITE_FAILED",
            cause,
        });
    }
}

/**
 * Persist a session (cookie/imei/userAgent bundle) to disk with restrictive
 * file permissions. Overwrites any existing file at `filePath`.
 *
 * @param filePath Destination path, e.g. `./.zca-mt/session.json`.
 * @param session  The credentials object obtained from `api.getContext()`.
 */
export function saveSession(filePath: string, session: SavedSession): void {
    if (!isSavedSession(session)) {
        throw new SessionError("Refusing to save an invalid session", { code: "SESSION_SHAPE_INVALID" });
    }

    // Write-then-rename prevents a crash from leaving a partially written
    // credential file behind.
    atomicWrite(filePath, `${JSON.stringify(session, null, 2)}\n`);

    try {
        // Ensure permissions are correct even if the file already existed
        // with looser permissions.
        fs.chmodSync(filePath, 0o600);
    } catch {
        // Best-effort: not all platforms (e.g. Windows) support POSIX chmod.
    }
}

/** AES-256-GCM encrypted session storage with a per-file random salt and IV. */
export function saveEncryptedSession(filePath: string, session: SavedSession, passphrase: string): void {
    if (!isSavedSession(session)) throw new SessionError("Refusing to save an invalid session", { code: "SESSION_SHAPE_INVALID" });
    assertPassphrase(passphrase);
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = scryptSync(passphrase, salt, 32);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
    const payload: EncryptedSessionFile = {
        format: "zca-mt-session",
        version: 1,
        algorithm: "aes-256-gcm",
        salt: salt.toString("base64"),
        iv: iv.toString("base64"),
        authTag: cipher.getAuthTag().toString("base64"),
        ciphertext: ciphertext.toString("base64"),
    };
    atomicWrite(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

export function loadEncryptedSession(
    filePath: string,
    passphrase: string,
    options: SessionLoadOptions = {},
): SavedSession {
    assertPassphrase(passphrase);
    const maxBytes = options.maxBytes ?? 1024 * 1024;
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new RangeError("maxBytes must be a positive safe integer");
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new SessionError("Encrypted session path must be a regular file", { code: "SESSION_FILE_INVALID" });
    }
    if (stat.size > maxBytes) throw new SessionError("Encrypted session file is too large", { code: "SESSION_FILE_TOO_LARGE" });
    const raw = fs.readFileSync(filePath, "utf8");
    try {
        const payload = JSON.parse(raw) as EncryptedSessionFile;
        if (payload.format !== "zca-mt-session" || payload.version !== 1 || payload.algorithm !== "aes-256-gcm") {
            throw new Error("Unsupported encrypted session format");
        }
        const key = scryptSync(passphrase, Buffer.from(payload.salt, "base64"), 32);
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
        decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
        const cleartext = Buffer.concat([
            decipher.update(Buffer.from(payload.ciphertext, "base64")),
            decipher.final(),
        ]).toString("utf8");
        const session: unknown = JSON.parse(cleartext);
        if (!isSavedSession(session)) throw new Error("Invalid decrypted session shape");
        return session;
    } catch (cause) {
        throw new SessionError("Unable to decrypt session; the passphrase or file may be invalid", {
            code: "SESSION_DECRYPT_FAILED",
            cause,
        });
    }
}

export async function saveSessionAsync(filePath: string, session: SavedSession): Promise<void> {
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    saveSession(filePath, session);
}

export async function loadSessionAsync(filePath: string, options: SessionLoadOptions = {}): Promise<SavedSession> {
    await fsPromises.access(filePath);
    return loadSession(filePath, options);
}

/**
 * Load a previously saved session from disk.
 *
 * @throws {SessionError} if the file is missing, unreadable, or not valid JSON
 * matching the expected shape.
 */
export function loadSession(filePath: string, options: SessionLoadOptions = {}): SavedSession {
    if (!fs.existsSync(filePath)) {
        throw new SessionError(`Session file not found: ${filePath}`, { code: "SESSION_NOT_FOUND" });
    }

    const maxBytes = options.maxBytes ?? 1024 * 1024;
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
        throw new RangeError("loadSession: maxBytes must be a positive safe integer");
    }

    let raw: string;
    try {
        const stat = fs.lstatSync(filePath);
        if (!stat.isFile() || stat.isSymbolicLink()) {
            throw new SessionError(`Session path must be a regular file: ${filePath}`, {
                code: "SESSION_FILE_INVALID",
            });
        }
        if (stat.size > maxBytes) {
            throw new SessionError(`Session file exceeds ${maxBytes} bytes: ${filePath}`, {
                code: "SESSION_FILE_TOO_LARGE",
            });
        }
        raw = fs.readFileSync(filePath, "utf-8");
    } catch (cause) {
        if (cause instanceof SessionError) throw cause;
        throw new SessionError(`Unable to read session file: ${filePath}`, {
            code: "SESSION_READ_FAILED",
            cause,
        });
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (cause) {
        throw new SessionError(`Session file is not valid JSON: ${filePath}`, {
            code: "SESSION_PARSE_FAILED",
            cause,
        });
    }

    if (!isSavedSession(parsed)) {
        throw new SessionError(`Session file is missing required fields: ${filePath}`, {
            code: "SESSION_SHAPE_INVALID",
        });
    }

    return parsed;
}

export function isSavedSession(value: unknown): value is SavedSession {
    if (!value || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    return typeof v.imei === "string" && typeof v.userAgent === "string" && v.cookie !== undefined && v.cookie !== null;
}

/**
 * Deletes a saved session file, if present. Never throws if the file does
 * not exist.
 */
export function deleteSession(filePath: string): void {
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}
