import { join } from "node:path";
import { UserError } from "./errors.mjs";
import { readText } from "./fs-util.mjs";
import { ROOT } from "./paths.mjs";

/** @typedef {import("./types.mjs").Catalog} Catalog */
/** @typedef {import("./types.mjs").Item} Item */
/** @typedef {import("./types.mjs").Options} Options */
/** @typedef {import("./types.mjs").Selected} Selected */

/** @returns {Promise<Catalog>} */
export const loadCatalog = async () => {
	/** @type {Catalog} */
	const catalog = JSON.parse(await readText(join(ROOT, "catalog.json")));
	return catalog;
};

/**
 * @param {string} flag
 * @param {string | undefined} value
 * @param {Item[]} items
 * @returns {string[] | null}
 */
const parseList = (flag, value, items) => {
	const ids = items.map((item) => item.id);
	if (value === undefined) {
		return null;
	}
	if (value === "all") {
		return ids;
	}
	if (value === "none") {
		return [];
	}
	const wanted = value
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean);
	const unknown = wanted.filter((id) => !ids.includes(id));
	if (unknown.length > 0) {
		throw new UserError(
			`Unknown ${flag} id: ${unknown.join(", ")}\nValid ids: ${ids.join(", ")}`,
		);
	}
	return wanted;
};

/**
 * @param {Options} opts
 * @param {Catalog} catalog
 * @returns {{ rules: string[] | null, plugins: string[] | null, guards: string[] | null }}
 */
export const resolveSelections = (opts, catalog) => ({
	rules: parseList("--rules", opts.rules, catalog.rules),
	plugins: parseList("--plugins", opts.plugins, catalog.plugins),
	guards: parseList("--guards", opts.guards, catalog.guards),
});

/**
 * @template {Item} T
 * @param {T[]} items
 * @param {string[]} ids
 * @returns {T[]}
 */
export const byIds = (items, ids) =>
	items.filter((item) => ids.includes(item.id));

/**
 * @param {Selected} selected
 * @returns {string}
 */
export const describe = (selected) => {
	/** @param {Item[]} items */
	const names = (items) => items.map((item) => item.id).join(",") || "none";
	return `rules=${names(selected.rules)} plugins=${names(selected.plugins)} guards=${names(selected.guards)}`;
};
