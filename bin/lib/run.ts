import { join, resolve } from "node:path";
import { applyFiles, applyPackageIdentity, applyScripts } from "./apply.ts";
import { formatWrittenFiles, syncSchemaVersion } from "./biome-bin.ts";
import { byIds, loadCatalog, resolveSelections } from "./catalog.ts";
import { settle } from "./confirm.ts";
import { UserError } from "./errors.ts";
import { pathExists } from "./fs-util.ts";
import { detectPackageManager, installBiome } from "./package-manager.ts";
import { ROOT } from "./paths.ts";
import { CONFIG_ID, planConfig } from "./plan-config.ts";
import { planScripts } from "./plan-scripts.ts";
import { conflictDecider, pick } from "./prompts.ts";
import { printReport, say } from "./report.ts";
import { syncPluginPaths } from "./shared-config.ts";
import type { Catalog, Context, Options } from "./types.ts";
import { createWriter } from "./writer.ts";

const chooseIds = async (
	catalog: Catalog,
	preset: ReturnType<typeof resolveSelections>,
	interactive: boolean,
): Promise<{ rules: string[]; plugins: string[]; guards: string[] }> => {
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
 * Runs the installer in the directory of the options.
 * It plans the changes and asks about conflicts. Then it writes the files and prints the report.
 * @throws {UserError} When the directory is the biome-json repo or does not exist. A step of the run can also throw it.
 */
export const run = async (opts: Options): Promise<void> => {
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
	const ctx: Context = {
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
	const plan = [...(await planConfig(ctx)), ...(await planScripts(ctx))];
	const accepted = await settle(ctx, plan);
	for (const op of accepted) {
		if (op.note) {
			ctx.report.notes.push(op.note);
		}
	}
	const configWritten = accepted.some((op) => op.id === CONFIG_ID);
	const createdPackage = !(await pathExists(join(cwd, "package.json")));
	// A failed install must leave the project untouched. So the install runs before any write.
	if (opts.install) {
		await installBiome(ctx);
	}
	await applyFiles(ctx, accepted);
	if (createdPackage && opts.install && !opts.dryRun) {
		await applyPackageIdentity(ctx);
	}
	await applyScripts(ctx, accepted);
	// Without the config that this run writes, the formatter would use the other Biome config of the user.
	if (configWritten && !opts.dryRun) {
		await syncPluginPaths(ctx);
		await syncSchemaVersion(ctx);
		await formatWrittenFiles(ctx);
	}
	printReport(ctx, configWritten);
};
