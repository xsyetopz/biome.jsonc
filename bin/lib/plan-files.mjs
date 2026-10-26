import { join } from "node:path";
import { UserError } from "./errors.mjs";
import { pathExists, readText } from "./fs-util.mjs";
import { ROOT } from "./paths.mjs";

/** @typedef {import("./types.mjs").Operation} Operation */

/**
 * Plans copying a file from this package into the target; no prompts, no writes.
 * @param {string} cwd
 * @param {string} sourceRel
 * @param {string} destRel
 * @param {string | null} after
 * @returns {Promise<Operation[]>}
 */
export const planCopy = async (cwd, sourceRel, destRel, after) => {
	const source = join(ROOT, sourceRel);
	if (!(await pathExists(source))) {
		throw new UserError(`Missing source file: ${sourceRel}`);
	}
	const dest = join(cwd, destRel);
	const content = await readText(source);
	const present = await pathExists(dest);
	if (present && (await readText(dest)) === content) {
		return [];
	}
	return [
		{
			kind: "write",
			id: destRel,
			path: dest,
			content,
			conflict: present,
			label: `${destRel} exists: overwrite`,
			skip: `${destRel}: exists (use --force)`,
			after,
		},
	];
};
