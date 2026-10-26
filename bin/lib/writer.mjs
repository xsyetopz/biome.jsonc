import { rename, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { ensureDir } from "./fs-util.mjs";

/** @typedef {import("./types.mjs").Writer} Writer */

/**
 * @param {string} cwd
 * @param {boolean} dryRun
 * @returns {Writer}
 */
export const createWriter = (cwd, dryRun) => {
	/** @type {string[]} */
	const written = [];
	/** @param {string} file */
	const rel = (file) => relative(cwd, file) || ".";
	return {
		written,
		async put(file, content) {
			const name = rel(file);
			if (!written.includes(name)) {
				written.push(name);
			}
			if (!dryRun) {
				await ensureDir(file);
				await writeFile(file, content);
			}
		},
		async move(from, to) {
			written.push(`${rel(to)} (renamed from ${rel(from)})`);
			if (!dryRun) {
				await rename(from, to);
			}
		},
	};
};
