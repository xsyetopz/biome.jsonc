import { join } from "node:path";
import { pathExists, readText } from "./fs-util.ts";
import { appendPlugin, applyRules, setPath } from "./jsonc-edit.ts";
import {
	BIOME_VERSION,
	hasNursery,
	readPackageJson,
} from "./package-manager.ts";
import { ROOT } from "./paths.ts";
import {
	isOwnConfig,
	localSettings,
	PLUGIN_DIR,
	SHARED,
} from "./shared-config.ts";
import type { Context, Operation } from "./types.ts";
import { applyVcs } from "./vcs.ts";

/** Operation id of the biome.jsonc write. */
export const CONFIG_ID = "biome.jsonc";
const BACKUP_ID = "config-backup";
const CONFIG_NAMES = ["biome.json", "biome.jsonc"];
const DECORATOR_FRAMEWORKS = ["@nestjs/core", "@angular/core"];
const PLUGIN_COPY_RE = /^(?:\.\/)?\.biome\/plugins\/(\w+)\.grit$/;

const usesDecoratorInjection = async (cwd: string): Promise<boolean> => {
	const data = (await readPackageJson(cwd))?.data;
	const deps = { ...data?.dependencies, ...data?.devDependencies };
	return DECORATOR_FRAMEWORKS.some((name) => Object.hasOwn(deps, name));
};

const existingConfigs = async (cwd: string): Promise<string[]> => {
	const present = await Promise.all(
		CONFIG_NAMES.map((name) => pathExists(join(cwd, name))),
	);
	return CONFIG_NAMES.filter((_name, index) => present[index]);
};

/** Gives the config that Biome loads, when this installer wrote it. Biome loads biome.json before biome.jsonc. */
const ownConfig = async (
	cwd: string,
	names: string[],
): Promise<{ name: string; text: string } | undefined> => {
	const name = names[0];
	if (name === undefined) {
		return;
	}
	const text = await readText(join(cwd, name));
	return isOwnConfig(text) ? { name, text } : undefined;
};

/** Gives the plugin id of a `.biome/plugins/` copy. */
const copyId = (entry: unknown): string | undefined =>
	typeof entry === "string" ? entry.match(PLUGIN_COPY_RE)?.[1] : undefined;

/** Points a `.biome/plugins/` copy at the package, when the copy is missing or still matches its packaged plugin. */
const packagePlugins = async (
	cwd: string,
	entries: unknown[],
): Promise<unknown[]> =>
	await Promise.all(
		entries.map(async (entry) => {
			const id = copyId(entry);
			if (id === undefined) {
				return entry;
			}
			const source = join(ROOT, "plugins", `${id}.grit`);
			if (!(await pathExists(source))) {
				return entry;
			}
			const copy = join(cwd, `${entry}`);
			const edited =
				(await pathExists(copy)) &&
				(await readText(copy)) !== (await readText(source));
			return edited ? entry : `${PLUGIN_DIR}/${id}.grit`;
		}),
	);

/** Carries the own settings and plugins of the repo from an old config onto `base`. */
const migrate = async (
	cwd: string,
	own: { name: string; text: string },
	base: string,
): Promise<{ text: string; kept: unknown[]; note: string }> => {
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
 * Plans the config and the backup of an existing config. The config depends on the backup.
 * A config that this installer wrote keeps its own settings on top of `extends`.
 */
export const planConfig = async (ctx: Context): Promise<Operation[]> => {
	const { cwd, selected } = ctx;
	const existing = await existingConfigs(cwd);
	const gate = existing.length > 0 ? BACKUP_ID : null;
	const own = await ownConfig(cwd, existing);
	const ops: Operation[] = [];
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
	// An edited copy of a selected plugin stays in use instead of the packaged plugin.
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
