import { applyEdits, modify, parse } from "jsonc-parser";
import { UserError } from "./errors.ts";
import type { Rule } from "./types.ts";

const FORMAT = { formattingOptions: { insertSpaces: false, tabSize: 1 } };

/**
 * Sets a value at a path in JSONC text.
 * @returns The new text.
 */
export const setPath = (
	text: string,
	path: (string | number)[],
	value: unknown,
): string => applyEdits(text, modify(text, path, value, FORMAT));

/**
 * Adds an entry to the `plugins` array of JSONC text.
 * When `plugins` does not exist or is not an array, the function replaces it with a new array.
 * The function skips an entry that is already in the array.
 */
export const appendPlugin = (text: string, entry: unknown): string => {
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
 * Writes the settings of the selected rules into the linter rules of JSONC text.
 * @returns The new text.
 * @throws {UserError} When a rule key in the catalog is not `group.name`.
 */
export const applyRules = (text: string, selected: Rule[]): string => {
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
