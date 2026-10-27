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
// First line of templates/strict.jsonc, which older installs copied whole.
const COPY_HEADER = "// Strict Biome config for any Node repo";

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isPlainObject = (value) =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * @param {unknown} value
 * @returns {unknown[]}
 */
const asArray = (value) => (Array.isArray(value) ? value : []);

/**
 * Whether this installer wrote the config: a full template copy, or one that extends the package.
 * @param {string} text
 * @returns {boolean}
 */
export const isOwnConfig = (text) =>
	text.includes(COPY_HEADER) || asArray(parse(text)?.extends).includes(SHARED);

/**
 * What `value` sets differently from `base`. Under `extends`, Biome merges objects key by key
 * and lets every other value replace the extended one.
 * @param {unknown} value
 * @param {unknown} base
 * @returns {unknown}
 */
const diff = (value, base) => {
	if (!(isPlainObject(value) && isPlainObject(base))) {
		return isDeepStrictEqual(value, base) ? undefined : value;
	}
	/** @type {Record<string, unknown>} */
	const out = {};
	for (const [key, item] of Object.entries(value)) {
		const kept = diff(item, base[key]);
		if (kept !== undefined) {
			out[key] = kept;
		}
	}
	return Object.keys(out).length > 0 ? out : undefined;
};

/**
 * Settings of `base` that `value` lacks; each starts to apply once the config extends `base`.
 * @param {unknown} value
 * @param {unknown} base
 * @returns {number}
 */
const countMissing = (value, base) => {
	if (!(isPlainObject(base) && (value === undefined || isPlainObject(value)))) {
		return value === undefined ? 1 : 0;
	}
	let count = 0;
	for (const [key, item] of Object.entries(base)) {
		count += countMissing(value?.[key], item);
	}
	return count;
};

/**
 * @param {unknown} data
 * @returns {{ parents: unknown[], overrides: unknown[], plugins: unknown[], rest: Record<string, unknown> }}
 */
const split = (data) => {
	const {
		$schema: _schema,
		extends: parents,
		overrides,
		plugins,
		...rest
	} = isPlainObject(data) ? data : {};
	return {
		parents: asArray(parents),
		overrides: asArray(overrides),
		plugins: asArray(plugins),
		rest,
	};
};

/**
 * The repo's own part of a config this installer wrote, to keep on top of `extends`.
 * @param {string} text
 * @param {string} templateText
 * @returns {{ settings: Record<string, unknown>, parents: unknown[], plugins: unknown[], missing: number }}
 */
export const localSettings = (text, templateText) => {
	const old = split(parse(text));
	const template = split(parse(templateText));
	const kept = diff(old.rest, template.rest);
	const settings = isPlainObject(kept) ? kept : {};
	// Biome appends `overrides` of extended files instead of replacing them.
	/** @param {unknown[]} from @param {unknown[]} without */
	const unmatched = (from, without) =>
		from.filter((entry) => !without.some((o) => isDeepStrictEqual(entry, o)));
	const overrides = unmatched(old.overrides, template.overrides);
	if (overrides.length > 0) {
		settings["overrides"] = overrides;
	}
	const shared = old.parents.includes(SHARED);
	const missing = shared
		? 0
		: countMissing(old.rest, template.rest) +
			unmatched(template.overrides, old.overrides).length;
	const parents = shared ? old.parents : [SHARED, ...old.parents];
	return { settings, parents, plugins: old.plugins, missing };
};

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
