import { join } from "node:path";
import { pathExists, readText } from "./fs-util.mjs";
import { appendPlugin, applyRules, setPath } from "./jsonc-edit.mjs";
import {
	BIOME_VERSION,
	hasNursery,
	readPackageJson,
} from "./package-manager.mjs";
import { ROOT } from "./paths.mjs";
import { PLUGIN_DIR } from "./shared-config.mjs";
import { applyVcs } from "./vcs.mjs";

/** @typedef {import("./types.mjs").Context} Context */
/** @typedef {import("./types.mjs").Operation} Operation */

export const CONFIG_ID = "biome.jsonc";
const BACKUP_ID = "config-backup";
const CONFIG_NAMES = ["biome.json", "biome.jsonc"];
const DECORATOR_FRAMEWORKS = ["@nestjs/core", "@angular/core"];

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
 * Plans the config and the backup of an existing config; the config depends on the backup.
 * @param {Context} ctx
 * @returns {Promise<Operation[]>}
 */
export const planConfig = async (ctx) => {
	const { cwd, selected } = ctx;
	const existing = await existingConfigs(cwd);
	const gate = existing.length > 0 ? BACKUP_ID : null;
	/** @type {Operation[]} */
	const ops = [];
	if (gate) {
		ops.push({
			kind: "backup",
			id: BACKUP_ID,
			conflict: true,
			label: `${existing.join(" and ")} exists: replace (old file moves to .bak)`,
			skip: `biome.jsonc, rules and plugins: ${existing.join(", ")} exists (use --force)`,
			after: null,
			names: existing,
		});
	}
	let text = applyRules(
		await readText(join(ROOT, "templates", "local.jsonc")),
		selected.rules,
	);
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
	for (const plugin of selected.plugins) {
		text = appendPlugin(text, `${PLUGIN_DIR}/${plugin.id}.grit`);
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
	});
	return ops;
};
