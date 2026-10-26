import { applyEdits, modify, parse } from "jsonc-parser";
import { UserError } from "./errors.mjs";

/** @typedef {import("./types.mjs").Rule} Rule */

const FORMAT = { formattingOptions: { insertSpaces: false, tabSize: 1 } };

/**
 * @param {string} text
 * @param {(string | number)[]} path
 * @param {unknown} value
 * @returns {string}
 */
export const setPath = (text, path, value) =>
	applyEdits(text, modify(text, path, value, FORMAT));

/**
 * @param {string} text
 * @param {string} entry
 * @returns {string}
 */
export const appendPlugin = (text, entry) => {
	const current = parse(text)?.plugins;
	if (!Array.isArray(current)) {
		return setPath(text, ["plugins"], [entry]);
	}
	if (current.includes(entry)) {
		return text;
	}
	const edits = modify(text, ["plugins", -1], entry, {
		...FORMAT,
		isArrayInsertion: true,
	});
	return applyEdits(text, edits);
};

/**
 * @param {string} text
 * @param {Rule[]} selected
 * @returns {string}
 */
export const applyRules = (text, selected) => {
	let out = text;
	for (const rule of selected) {
		for (const [key, value] of Object.entries(rule.set)) {
			const [group, name] = key.split(".");
			if (group === undefined || name === undefined) {
				throw new UserError(`Malformed rule key in catalog: ${key}`);
			}
			out = setPath(out, ["linter", "rules", group, name], value);
		}
	}
	return out;
};
