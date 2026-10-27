import { isAbsolute, join, relative, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parse } from "jsonc-parser";
import { ancestors, pathExists, readText } from "./fs-util.ts";
import { setPath } from "./jsonc-edit.ts";
import type { Context } from "./types.ts";

/** Name of this package. */
export const PACKAGE_NAME = "biome-json";
/** Install spec of this package. */
export const PACKAGE_SPEC = `${PACKAGE_NAME}@github:xsyetopz/biome.jsonc`;
/** Name of the shared config that biome.jsonc extends. */
export const SHARED = `${PACKAGE_NAME}/strict`;
/** Directory of the packaged plugins in node_modules. */
export const PLUGIN_DIR = `./node_modules/${PACKAGE_NAME}/plugins`;
// This text starts line 1 of templates/strict.jsonc. Older installs copied the whole file.
const COPY_HEADER = "// Strict Biome config for any Node repo";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const asArray = (value: unknown): unknown[] =>
	Array.isArray(value) ? value : [];

/** Checks if this installer wrote the config. The check is true when the text contains the template header or the config extends the package. */
export const isOwnConfig = (text: string): boolean =>
	text.includes(COPY_HEADER) || asArray(parse(text)?.extends).includes(SHARED);

/**
 * Gives what `value` sets differently from `base`.
 * Under `extends`, Biome merges objects key by key. Every other value replaces the extended value.
 */
const diff = (value: unknown, base: unknown): unknown => {
	if (!(isPlainObject(value) && isPlainObject(base))) {
		return isDeepStrictEqual(value, base) ? undefined : value;
	}
	const out: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value)) {
		const kept = diff(item, base[key]);
		if (kept !== undefined) {
			out[key] = kept;
		}
	}
	return Object.keys(out).length > 0 ? out : undefined;
};

/**
 * Counts the settings of `base` that `value` lacks.
 * Each setting starts to apply when the config extends `base`.
 */
const countMissing = (value: unknown, base: unknown): number => {
	if (!(isPlainObject(base) && (value === undefined || isPlainObject(value)))) {
		return value === undefined ? 1 : 0;
	}
	let count = 0;
	for (const [key, item] of Object.entries(base)) {
		count += countMissing(value?.[key], item);
	}
	return count;
};

const split = (
	data: unknown,
): {
	parents: unknown[];
	overrides: unknown[];
	plugins: unknown[];
	rest: Record<string, unknown>;
} => {
	const {
		$schema: _schema,
		extends: parents,
		overrides,
		plugins,
		...rest
	}: Record<string, unknown> = isPlainObject(data) ? data : {};
	return {
		parents: asArray(parents),
		overrides: asArray(overrides),
		plugins: asArray(plugins),
		rest,
	};
};

/**
 * Gives the own part of the repo from a config that this installer wrote.
 * The new config keeps this part on top of `extends`.
 */
export const localSettings = (
	text: string,
	templateText: string,
): {
	settings: Record<string, unknown>;
	parents: unknown[];
	plugins: unknown[];
	missing: number;
} => {
	const old = split(parse(text));
	const template = split(parse(templateText));
	const kept = diff(old.rest, template.rest);
	const settings = isPlainObject(kept) ? kept : {};
	// Biome appends `overrides` of extended files instead of replacing them.
	const unmatched = (from: unknown[], without: unknown[]) =>
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
 * Makes the plugin paths follow the place of the installed package.
 * Plugin paths resolve against the repo, not the extended file. A workspace hoists the package to the root.
 */
export const syncPluginPaths = async (ctx: Context): Promise<void> => {
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
