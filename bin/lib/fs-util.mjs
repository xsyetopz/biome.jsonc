import { access, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * @param {string} file
 * @returns {Promise<boolean>}
 */
export const pathExists = async (file) => {
	try {
		await access(file);
		return true;
	} catch {
		return false;
	}
};

/**
 * @param {string} file
 * @returns {Promise<string>}
 */
export const readText = (file) => readFile(file, "utf8");

/**
 * @param {string} file
 * @returns {Promise<void>}
 */
export const ensureDir = async (file) => {
	await mkdir(dirname(file), { recursive: true });
};

/**
 * @param {string} start
 * @returns {string[]} start and each parent up to the filesystem root
 */
export const ancestors = (start) => {
	const dirs = [start];
	for (let dir = dirname(start); dir !== dirs.at(-1); dir = dirname(dir)) {
		dirs.push(dir);
	}
	return dirs;
};
