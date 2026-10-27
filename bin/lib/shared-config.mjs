import { isAbsolute, join, relative, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parse } from "jsonc-parser";
import { ancestors, pathExists, readText } from "./fs-util.mjs";
import { setPath } from "./jsonc-edit.mjs";

/** @typedef {import("./types.mjs").Context} Context */

export const PACKAGE_NAME = "biome-json";
export const PACKAGE_SPEC = `${PACKAGE_NAME}@github:xsyetopz/biome-json`;
export const SHARED = `${PACKAGE_NAME}/strict`;
export const PLUGIN_DIR = `./node_modules/${PACKAGE_NAME}/plugins`;

/**
 * @param {unknown} value
 * @returns {unknown[]}
 */
const asArray = (value) => (Array.isArray(value) ? value : []);

/**
 * Plugin paths resolve against the repo, not the extended file, so they follow wherever the
 * package was installed (a workspace hoists it to the root).
 * @param {Context} ctx
 * @returns {Promise<void>}
 */
export const syncPluginPaths = async (ctx) => {
	const dirs = ancestors(ctx.cwd).map((dir) =>
		join(dir, "node_modules", PACKAGE_NAME),
	);
	const present = await Promise.all(
		dirs.map((dir) => pathExists(join(dir, "package.json"))),
	);
	const found = dirs.find((_dir, index) => present[index]);
	if (found === undefined) {
		ctx.report.notes.push(
			`biome.jsonc extends ${SHARED}, which is not installed: run \`${ctx.pm} add -D ${PACKAGE_SPEC}\`.`,
		);
		return;
	}
	const rel = relative(ctx.cwd, join(found, "plugins")).split(sep).join("/");
	const prefix = rel.startsWith("..") || isAbsolute(rel) ? rel : `./${rel}`;
	const file = join(ctx.cwd, "biome.jsonc");
	const text = await readText(file);
	const plugins = asArray(parse(text)?.plugins);
	const next = plugins.map((entry) =>
		typeof entry === "string" && entry.startsWith(`${PLUGIN_DIR}/`)
			? `${prefix}${entry.slice(PLUGIN_DIR.length)}`
			: entry,
	);
	if (!isDeepStrictEqual(next, plugins)) {
		await ctx.writer.put(file, setPath(text, ["plugins"], next));
	}
};
