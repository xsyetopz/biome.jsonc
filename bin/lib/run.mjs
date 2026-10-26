import { basename, join, resolve } from "node:path";
import { applyFiles, applyPackageIdentity, applyScripts } from "./apply.mjs";
import { formatWrittenFiles, syncSchemaVersion } from "./biome-bin.mjs";
import { byIds, loadCatalog, resolveSelections } from "./catalog.mjs";
import { settle } from "./confirm.mjs";
import { UserError } from "./errors.mjs";
import { pathExists } from "./fs-util.mjs";
import { detectPackageManager, installBiome } from "./package-manager.mjs";
import { ROOT } from "./paths.mjs";
import { CONFIG_ID, planConfig } from "./plan-config.mjs";
import { planCopy } from "./plan-files.mjs";
import { planScripts } from "./plan-scripts.mjs";
import { conflictDecider, pick } from "./prompts.mjs";
import { printReport, say } from "./report.mjs";
import { createWriter } from "./writer.mjs";

/** @typedef {import("./types.mjs").Catalog} Catalog */
/** @typedef {import("./types.mjs").Context} Context */
/** @typedef {import("./types.mjs").Options} Options */

/**
 * @param {Catalog} catalog
 * @param {ReturnType<typeof resolveSelections>} preset
 * @param {boolean} interactive
 * @returns {Promise<{ rules: string[], plugins: string[], guards: string[] }>}
 */
const chooseIds = async (catalog, preset, interactive) => {
	const defaultGuards = catalog.guards.map((guard) => guard.id);
	return {
		rules: await pick("Rules", catalog.rules, preset.rules, interactive, []),
		plugins: await pick(
			"Plugins",
			catalog.plugins,
			preset.plugins,
			interactive,
			[],
		),
		guards: await pick(
			"Guards",
			catalog.guards,
			preset.guards,
			interactive,
			defaultGuards,
		),
	};
};

/**
 * @param {Options} opts
 * @returns {Promise<void>}
 */
export const run = async (opts) => {
	const cwd = resolve(opts.cwd);
	if (cwd === resolve(ROOT)) {
		throw new UserError("Refusing to install into the biome-json repo itself.");
	}
	if (!(await pathExists(cwd))) {
		throw new UserError(`Directory not found: ${cwd}`);
	}
	const catalog = await loadCatalog();
	const preset = resolveSelections(opts, catalog);
	const tty = Boolean(process.stdin.isTTY && process.stdout.isTTY);
	const interactive = tty && !opts.yes;
	if (!(tty || opts.yes)) {
		say("Not a TTY: behaving like --yes.");
	}
	const ids = await chooseIds(catalog, preset, interactive);
	/** @type {Context} */
	const ctx = {
		cwd,
		opts,
		pm: await detectPackageManager(cwd),
		writer: createWriter(cwd, opts.dryRun),
		decide: conflictDecider(opts, interactive),
		report: { skipped: [], notes: [], install: "" },
		selected: {
			rules: byIds(catalog.rules, ids.rules),
			plugins: byIds(catalog.plugins, ids.plugins),
			guards: byIds(catalog.guards, ids.guards),
		},
	};
	const guardCopies = await Promise.all(
		ctx.selected.guards.map((guard) =>
			planCopy(cwd, guard.file, join(".biome", basename(guard.file)), null),
		),
	);
	const plan = [
		...(await planConfig(ctx)),
		...guardCopies.flat(),
		...(await planScripts(ctx)),
	];
	const accepted = await settle(ctx, plan);
	const configWritten = accepted.some((op) => op.id === CONFIG_ID);
	const createdPackage = !(await pathExists(join(cwd, "package.json")));
	// A failed install must leave the project untouched, so it runs before any write.
	if (opts.install) {
		await installBiome(ctx);
	}
	await applyFiles(ctx, accepted);
	if (createdPackage && opts.install && !opts.dryRun) {
		await applyPackageIdentity(ctx);
	}
	await applyScripts(ctx, accepted);
	// Without our config, formatting would follow the user's own Biome config.
	if (configWritten && !opts.dryRun) {
		await syncSchemaVersion(ctx);
		await formatWrittenFiles(ctx);
	}
	printReport(ctx, configWritten);
};
