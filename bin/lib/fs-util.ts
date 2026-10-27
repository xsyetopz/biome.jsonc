import { access, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Checks if a file or directory exists.
 */
export const pathExists = async (file: string): Promise<boolean> => {
	try {
		await access(file);
		return true;
	} catch {
		return false;
	}
};

/**
 * Reads a file as UTF-8 text.
 */
export const readText = (file: string): Promise<string> =>
	readFile(file, "utf8");

/**
 * Creates the parent directory of a file, and its own parents.
 */
export const ensureDir = async (file: string): Promise<void> => {
	await mkdir(dirname(file), { recursive: true });
};

/**
 * Lists a directory and each of its parents.
 * @returns The start directory and each parent up to the filesystem root.
 */
export const ancestors = (start: string): string[] => {
	const dirs = [start];
	for (let dir = dirname(start); dir !== dirs.at(-1); dir = dirname(dir)) {
		dirs.push(dir);
	}
	return dirs;
};
