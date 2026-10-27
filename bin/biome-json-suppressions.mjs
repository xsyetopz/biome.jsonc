#!/usr/bin/env node
/**
 * Runs the suppression guard in `check-suppressions.mjs`.
 * Under bun, it runs the guard in the same process.
 * Under node, it runs the guard with bun when bun is on PATH. Without bun, the guard runs in node.
 * Usage: biome-json-suppressions [rootDir]
 * The exit code is the exit code of the guard.
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const GUARD = new URL("./check-suppressions.mjs", import.meta.url);

/**
 * Runs the guard with bun.
 * @returns {Promise<number | null>} The exit code of bun, or null when bun is not on PATH.
 */
const runWithBun = async () => {
	const child = spawn("bun", [fileURLToPath(GUARD), ...process.argv.slice(2)], {
		stdio: "inherit",
	});
	try {
		const [code] = await once(child, "exit");
		return typeof code === "number" ? code : 1;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return null;
		}
		throw error;
	}
};

const code = process.versions.bun ? null : await runWithBun();
if (code === null) {
	await import(GUARD.href);
} else {
	process.exitCode = code;
}
