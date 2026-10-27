import { join } from "node:path";
import { supportsErrorOnWarnings } from "./biome-bin.ts";
import { pathExists } from "./fs-util.ts";
import { readPackageJson } from "./package-manager.ts";
import type { Context, Operation } from "./types.ts";

// Older installs copied the guard into the repo. They ran it from there.
const OLD_GUARD_COPY = ".biome/check-suppressions.mjs";
const OLD_SCRIPTS = new Set([
	`node ${OLD_GUARD_COPY}`,
	`bun ${OLD_GUARD_COPY}`,
]);

const desiredScripts = async (
	ctx: Context,
): Promise<Record<string, string>> => {
	const { pm, selected, report } = ctx;
	const scripts: Record<string, string> = {};
	if (!ctx.opts.scripts) {
		return scripts;
	}
	for (const guard of selected.guards) {
		scripts[guard.script.name] = guard.script.command;
	}
	const guarded = selected.guards.some(
		(guard) => guard.script.name === "lint:suppressions",
	);
	const base = "biome check --error-on-warnings";
	scripts["lint"] = guarded ? `${base} && ${pm} run lint:suppressions` : base;
	scripts["lint:fix"] = "biome check --write --error-on-warnings";
	const ci = await supportsErrorOnWarnings(ctx.cwd);
	if (ci.note) {
		report.notes.push(`lint:ci: ${ci.note}`);
	}
	if (ci.ok) {
		scripts["lint:ci"] = "biome ci --error-on-warnings";
	} else {
		scripts["lint:ci"] = "biome ci";
		report.notes.push(
			"lint:ci: `biome ci` rejects --error-on-warnings; flag dropped",
		);
	}
	return scripts;
};

/**
 * Plans the script changes.
 * Replacing a script that differs is a conflict.
 * The exception is a `lint:suppressions` script that an older install wrote.
 */
export const planScripts = async (ctx: Context): Promise<Operation[]> => {
	if (
		ctx.selected.guards.length > 0 &&
		(await pathExists(join(ctx.cwd, OLD_GUARD_COPY)))
	) {
		ctx.report.notes.push(
			`${OLD_GUARD_COPY} is no longer needed once \`lint:suppressions\` runs \`biome-json-suppressions\` from the package: then delete the copy.`,
		);
	}
	const wanted = await desiredScripts(ctx);
	const current = (await readPackageJson(ctx.cwd))?.data.scripts ?? {};
	const ops: Operation[] = [];
	for (const [name, command] of Object.entries(wanted)) {
		const existing = current[name];
		if (existing !== command) {
			ops.push({
				kind: "script",
				id: `script:${name}`,
				name,
				command,
				conflict:
					existing !== undefined &&
					!(name === "lint:suppressions" && OLD_SCRIPTS.has(existing)),
				label: `script ${name}: "${existing}" -> "${command}"`,
				skip: `script ${name}: differs (use --force)`,
				after: null,
			});
		}
	}
	return ops;
};
