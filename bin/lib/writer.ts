import { rename, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { ensureDir } from "./fs-util.ts";
import type { Writer } from "./types.ts";

/** Creates a writer that records each written path. In a dry run, it writes nothing to the disk. */
export const createWriter = (cwd: string, dryRun: boolean): Writer => {
	const written: string[] = [];
	const rel = (file: string) => relative(cwd, file) || ".";
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
