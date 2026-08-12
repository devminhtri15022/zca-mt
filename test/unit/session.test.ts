import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveSession, loadSession, deleteSession, isSavedSession } from "../../src/session.js";
import { SessionError } from "../../src/Errors/SessionError.js";

function tmpFile(): string {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "zca-mt-session-")), "session.json");
}

describe("session helpers", () => {
    const files: string[] = [];

    afterEach(() => {
        for (const f of files.splice(0)) {
            try {
                fs.rmSync(path.dirname(f), { recursive: true, force: true });
            } catch {
                /* ignore */
            }
        }
    });

    it("round-trips a session through save/load", () => {
        const file = tmpFile();
        files.push(file);

        const session = {
            imei: "test-imei",
            userAgent: "test-agent",
            cookie: [{ name: "a", value: "b" }],
        };

        saveSession(file, session as never);
        const loaded = loadSession(file);

        expect(loaded).toEqual(session);
    });

    it("writes the session file with owner-only permissions on POSIX", () => {
        if (process.platform === "win32") return; // chmod semantics differ on Windows

        const file = tmpFile();
        files.push(file);

        saveSession(file, { imei: "i", userAgent: "u", cookie: [] } as never);

        const mode = fs.statSync(file).mode & 0o777;
        expect(mode).toBe(0o600);
    });

    it("throws SessionError when the file does not exist", () => {
        expect(() => loadSession("/tmp/does-not-exist-zca-mt-session.json")).toThrow(SessionError);
    });

    it("throws SessionError when the file is not valid JSON", () => {
        const file = tmpFile();
        files.push(file);
        fs.writeFileSync(file, "not json{{{");

        expect(() => loadSession(file)).toThrow(SessionError);
    });

    it("throws SessionError when required fields are missing", () => {
        const file = tmpFile();
        files.push(file);
        fs.writeFileSync(file, JSON.stringify({ imei: "only-imei" }));

        expect(() => loadSession(file)).toThrow(SessionError);
    });

    it("does not leak the raw cookie value in a SessionError message", () => {
        const file = tmpFile();
        files.push(file);
        fs.writeFileSync(file, JSON.stringify({ imei: "i" })); // missing userAgent/cookie

        try {
            loadSession(file);
            expect.unreachable();
        } catch (err) {
            expect(err).toBeInstanceOf(SessionError);
            expect((err as SessionError).message).not.toContain("cookie");
        }
    });

    it("deleteSession removes an existing file and is a no-op otherwise", () => {
        const file = tmpFile();
        files.push(file);
        saveSession(file, { imei: "i", userAgent: "u", cookie: [] } as never);

        expect(fs.existsSync(file)).toBe(true);
        deleteSession(file);
        expect(fs.existsSync(file)).toBe(false);

        // Second call must not throw even though the file is already gone.
        expect(() => deleteSession(file)).not.toThrow();
    });

    it("isSavedSession validates shape", () => {
        expect(isSavedSession({ imei: "i", userAgent: "u", cookie: [] })).toBe(true);
        expect(isSavedSession({ imei: "i" })).toBe(false);
        expect(isSavedSession(null)).toBe(false);
        expect(isSavedSession("nope")).toBe(false);
    });
});
