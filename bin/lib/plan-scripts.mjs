import { supportsErrorOnWarnings } from "./biome-bin.mjs";
import { readPackageJson } from "./package-manager.mjs";

/** @typedef {import("./types.mjs").Context} Context */
/** @typedef {import("./types.mjs").Operation} Operation */

/**
 * @param {Context} ctx
 * @returns {Promise<Record<string, string>>}
 */
const desiredScripts = async (ctx) => {
	const { pm, selected, report } = ctx;
	/** @type {Record<string, string>} */
	const scripts = {};
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
 * Plans the script changes; replacing a differing script is a conflict.
 * @param {Context} ctx
 * @returns {Promise<Operation[]>}
 */
export const planScripts = async (ctx) => {
	const wanted = await desiredScripts(ctx);
	const current = (await readPackageJson(ctx.cwd))?.data.scripts ?? {};
	/** @type {Operation[]} */
	const ops = [];
	for (const [name, command] of Object.entries(wanted)) {
		const existing = current[name];
		if (existing !== command) {
			ops.push({
				kind: "script",
				id: `script:${name}`,
				name,
				command,
				conflict: existing !== undefined,
				label: `script ${name}: "${existing}" -> "${command}"`,
				skip: `script ${name}: differs (use --force)`,
				after: null,
			});
		}
	}
	return ops;
};
