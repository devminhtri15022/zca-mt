import fs from "node:fs";
import path from "node:path";
import type { Credentials } from "./zalo.js";
import { SessionError } from "./Errors/SessionError.js";

/**
 * ZCA-MT does not persist login sessions automatically. Session persistence
 * is entirely opt-in and left to the application, because a saved session
 * file is equivalent to a valid, logged-in cookie for the account.
 *
 * These helpers exist only to make the "opt-in and store it safely" path
 * easy to do correctly:
 *   - the file is written with owner-only permissions (0600) where the
 *     platform supports it,
 *   - the directory is created if missing,
 *   - callers are responsible for adding the path to `.gitignore` (the
 *     ZCA-MT-generated `.gitignore` template already excludes common
 *     session file names).
 *
 * ZCA-MT never calls these functions on its own; nothing is written to disk
 * unless your application explicitly calls {@link saveSession}.
 */

export type SavedSession = Credentials;

/**
 * Persist a session (cookie/imei/userAgent bundle) to disk with restrictive
 * file permissions. Overwrites any existing file at `filePath`.
 *
 * @param filePath Destination path, e.g. `./.zca-mt/session.json`.
 * @param session  The credentials object obtained from `api.getContext()`.
 */
export function saveSession(filePath: string, session: SavedSession): void {
    const dir = path.dirname(filePath);
    if (dir && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), { mode: 0o600 });

    try {
        // Ensure permissions are correct even if the file already existed
        // with looser permissions.
        fs.chmodSync(filePath, 0o600);
    } catch {
        // Best-effort: not all platforms (e.g. Windows) support POSIX chmod.
    }
}

/**
 * Load a previously saved session from disk.
 *
 * @throws {SessionError} if the file is missing, unreadable, or not valid JSON
 * matching the expected shape.
 */
export function loadSession(filePath: string): SavedSession {
    if (!fs.existsSync(filePath)) {
        throw new SessionError(`Session file not found: ${filePath}`, { code: "SESSION_NOT_FOUND" });
    }

    let raw: string;
    try {
        raw = fs.readFileSync(filePath, "utf-8");
    } catch (cause) {
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
