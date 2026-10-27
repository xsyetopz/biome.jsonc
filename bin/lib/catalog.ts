import { join } from "node:path";
import { UserError } from "./errors.ts";
import { readText } from "./fs-util.ts";
import { ROOT } from "./paths.ts";
import type { Catalog, Item, Options, Selected } from "./types.ts";

/**
 * Loads catalog.json from the package root.
 */
export const loadCatalog = async (): Promise<Catalog> => {
	const catalog: Catalog = JSON.parse(
		await readText(join(ROOT, "catalog.json")),
	);
	return catalog;
};

const parseList = (
	flag: string,
	value: string | undefined,
	items: Item[],
): string[] | null => {
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
 * Converts the `--rules`, `--plugins`, and `--guards` options to lists of ids.
 * @returns The ids for each option, or `null` for an option that is not set.
 * @throws {UserError} When an option has an id that is not in the catalog.
 */
export const resolveSelections = (
	opts: Options,
	catalog: Catalog,
): {
	rules: string[] | null;
	plugins: string[] | null;
	guards: string[] | null;
} => ({
	rules: parseList("--rules", opts.rules, catalog.rules),
	plugins: parseList("--plugins", opts.plugins, catalog.plugins),
	guards: parseList("--guards", opts.guards, catalog.guards),
});

/**
 * Returns the items that have one of the ids.
 */
export const byIds = <T extends Item>(items: T[], ids: string[]): T[] =>
	items.filter((item) => ids.includes(item.id));

/**
 * Makes a one-line text that lists the ids of the selected items.
 */
export const describe = (selected: Selected): string => {
	const names = (items: Item[]) =>
		items.map((item) => item.id).join(",") || "none";
	return `rules=${names(selected.rules)} plugins=${names(selected.plugins)} guards=${names(selected.guards)}`;
};
