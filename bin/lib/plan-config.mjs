import { join } from "node:path";
import { pathExists, readText } from "./fs-util.mjs";
import { appendPlugin, applyRules, setPath } from "./jsonc-edit.mjs";
import {
	BIOME_VERSION,
	hasNursery,
	readPackageJson,
} from "./package-manager.mjs";
import { ROOT } from "./paths.mjs";
import {
	isOwnConfig,
	localSettings,
	PLUGIN_DIR,
	SHARED,
} from "./shared-config.mjs";
import { applyVcs } from "./vcs.mjs";

/** @typedef {import("./types.mjs").Context} Context */
/** @typedef {import("./types.mjs").Operation} Operation */

export const CONFIG_ID = "biome.jsonc";
const BACKUP_ID = "config-backup";
const CONFIG_NAMES = ["biome.json", "biome.jsonc"];
const DECORATOR_FRAMEWORKS = ["@nestjs/core", "@angular/core"];
const PLUGIN_COPY_RE = /^(?:\.\/)?\.biome\/plugins\/(\w+)\.grit$/;

/**
 * @param {string} cwd
 * @returns {Promise<boolean>}
 */
const usesDecoratorInjection = async (cwd) => {
	const data = (await readPackageJson(cwd))?.data;
	const deps = { ...data?.dependencies, ...data?.devDependencies };
	return DECORATOR_FRAMEWORKS.some((name) => Object.hasOwn(deps, name));
};

/**
 * @param {string} cwd
 * @returns {Promise<string[]>}
 */
const existingConfigs = async (cwd) => {
	const present = await Promise.all(
		CONFIG_NAMES.map((name) => pathExists(join(cwd, name))),
	);
	return CONFIG_NAMES.filter((_name, index) => present[index]);
};

/**
 * The config Biome loads (biome.json before biome.jsonc), when this installer wrote it.
 * @param {string} cwd
 * @param {string[]} names
 * @returns {Promise<{ name: string, text: string } | undefined>}
 */
const ownConfig = async (cwd, names) => {
	const name = names[0];
	if (name === undefined) {
		return;
	}
	const text = await readText(join(cwd, name));
	return isOwnConfig(text) ? { name, text } : undefined;
};

/**
 * @param {unknown} entry
 * @returns {string | undefined} the plugin id of a `.biome/plugins/` copy
 */
const copyId = (entry) =>
	typeof entry === "string" ? entry.match(PLUGIN_COPY_RE)?.[1] : undefined;

/**
 * Points a `.biome/plugins/` copy that still matches its packaged plugin at the package.
 * @param {string} cwd
 * @param {unknown[]} entries
 * @returns {Promise<unknown[]>}
 */
const packagePlugins = async (cwd, entries) =>
	await Promise.all(
		entries.map(async (entry) => {
			const id = copyId(entry);
			const source = join(ROOT, "plugins", `${id}.grit`);
			if (id === undefined || !(await pathExists(source))) {
				return entry;
			}
			const copy = join(cwd, `${entry}`);
			const edited =
				(await pathExists(copy)) &&
				(await readText(copy)) !== (await readText(source));
			return edited ? entry : `${PLUGIN_DIR}/${id}.grit`;
		}),
	);

/**
 * Carries the repo's own settings and plugins of an old config onto `base`.
 * @param {string} cwd
 * @param {{ name: string, text: string }} own
 * @param {string} base
 * @returns {Promise<{ text: string, kept: unknown[], note: string }>}
 */
const migrate = async (cwd, own, base) => {
	const local = localSettings(
		own.text,
		await readText(join(ROOT, "templates", "strict.jsonc")),
	);
	let text = setPath(base, ["extends"], local.parents);
	for (const [key, value] of Object.entries(local.settings)) {
		text = setPath(text, [key], value);
	}
	const kept = await packagePlugins(cwd, local.plugins);
	for (const entry of kept) {
		text = appendPlugin(text, entry);
	}
	const lacked =
		local.missing > 0
			? `; template settings that it lacked now apply: ${local.missing}`
			: "";
	const note = `${own.name} moved to extends ${SHARED}: biome.jsonc keeps only the settings that differ from it${lacked}. The .bak keeps the old comments.`;
	return { text, kept, note };
};

/**
 * Plans the config and the backup of an existing config; the config depends on the backup.
 * A config this installer wrote keeps its own settings on top of `extends`.
 * @param {Context} ctx
 * @returns {Promise<Operation[]>}
 */
export const planConfig = async (ctx) => {
	const { cwd, selected } = ctx;
	const existing = await existingConfigs(cwd);
	const gate = existing.length > 0 ? BACKUP_ID : null;
	const own = await ownConfig(cwd, existing);
	/** @type {Operation[]} */
	const ops = [];
	if (gate) {
		ops.push({
			kind: "backup",
			id: BACKUP_ID,
			conflict: true,
			label: `${existing.join(" and ")} exists: ${own ? `migrate to extends ${SHARED}` : "replace"} (old file moves to .bak)`,
			skip: `biome.jsonc, rules and plugins: ${existing.join(", ")} exists (use --force)`,
			after: null,
			names: existing,
		});
	}
	const base = await readText(join(ROOT, "templates", "local.jsonc"));
	const migrated = own
		? await migrate(cwd, own, base)
		: { text: base, kept: [], note: "" };
	const { kept, note } = migrated;
	let text = applyRules(migrated.text, selected.rules);
	if (hasNursery(selected)) {
		ctx.report.notes.push(
			`Nursery rules selected: Biome is pinned to ~${BIOME_VERSION} because a minor release can promote them and break config loading. Run \`biome migrate --write\` when you upgrade.`,
		);
	}
	if (await usesDecoratorInjection(cwd)) {
		text = setPath(text, ["linter", "rules", "style", "useImportType"], "off");
		ctx.report.notes.push(
			"style.useImportType is off: NestJS/Angular inject constructor parameters by their runtime class, and the rule's fix turns those imports into `import type`, which breaks injection.",
		);
	}
	// An edited copy of a selected plugin stays in use instead of the packaged one.
	for (const plugin of selected.plugins) {
		if (!kept.some((entry) => copyId(entry) === plugin.id)) {
			text = appendPlugin(text, `${PLUGIN_DIR}/${plugin.id}.grit`);
		}
	}
	ops.push({
		kind: "write",
		id: CONFIG_ID,
		path: join(cwd, "biome.jsonc"),
		content: await applyVcs(text, cwd),
		conflict: false,
		label: "biome.jsonc",
		skip: "",
		after: gate,
		...(note ? { note } : {}),
	});
	return ops;
};
