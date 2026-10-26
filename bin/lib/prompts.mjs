import { checkbox } from "@inquirer/prompts";

/** @typedef {import("./types.mjs").Item} Item */
/** @typedef {import("./types.mjs").Operation} Operation */
/** @typedef {import("./types.mjs").Options} Options */

/**
 * @param {string} message
 * @param {Item[]} items
 * @param {string[] | null} preset
 * @param {boolean} interactive
 * @param {string[]} defaults
 * @returns {Promise<string[]>}
 */
export const pick = async (message, items, preset, interactive, defaults) => {
	if (preset) {
		return preset;
	}
	if (!interactive) {
		return defaults;
	}
	return await checkbox({
		message,
		choices: items.map((item) => ({
			name: item.label,
			value: item.id,
			description: item.hint,
			checked: defaults.includes(item.id),
		})),
	});
};

/**
 * One decision for every conflict: ids of the operations the user accepts.
 * @param {Options} opts
 * @param {boolean} interactive
 * @returns {(conflicts: Operation[]) => Promise<string[]>}
 */
export const conflictDecider = (opts, interactive) => async (conflicts) => {
	if (opts.force) {
		return conflicts.map((op) => op.id);
	}
	if (!interactive) {
		return [];
	}
	return await checkbox({
		message: "Replace these existing files/scripts?",
		choices: conflicts.map((op) => ({
			name: op.label,
			value: op.id,
			checked: false,
		})),
	});
};
