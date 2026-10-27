import { join } from "node:path";
import { UserError } from "./errors.mjs";
import { capture, runInherited } from "./exec.mjs";
import { ancestors, pathExists, readText } from "./fs-util.mjs";
import { PACKAGE_SPEC } from "./shared-config.mjs";

/** @typedef {import("./types.mjs").Context} Context */
/** @typedef {import("./types.mjs").PackageJson} PackageJson */
/** @typedef {import("./types.mjs").PackageManager} PackageManager */
/** @typedef {import("./types.mjs").Selected} Selected */

export const BIOME_VERSION = "2.6.3";
const INDENT_RE = /^([ \t]+)"/m;
/** @type {Record<PackageManager, string[]>} */
const INSTALL_ARGS = {
	npm: ["install", "-D"],
	pnpm: ["add", "-D"],
	yarn: ["add", "-D"],
	bun: ["add", "-d"],
};
/** @type {Record<PackageManager, string>} */
export const EXEC = {
	npm: "npx",
	pnpm: "pnpm exec",
	yarn: "yarn",
	bun: "bunx",
};
/** @type {[string, PackageManager][]} */
const LOCKS = [
	["bun.lock", "bun"],
	["bun.lockb", "bun"],
	["pnpm-lock.yaml", "pnpm"],
	["yarn.lock", "yarn"],
	["package-lock.json", "npm"],
];

/**
 * @param {string} name
 * @returns {name is PackageManager}
 */
const isPackageManager = (name) => Object.hasOwn(INSTALL_ARGS, name);

/**
 * @param {unknown} value
 * @returns {boolean}
 */
const isPlainObject = (value) =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * @param {string} cwd
 * @returns {Promise<{ data: PackageJson, indent: string } | null>}
 */
export const readPackageJson = async (cwd) => {
	const file = join(cwd, "package.json");
	if (!(await pathExists(file))) {
		return null;
	}
	const text = await readText(file);
	const indent = text.match(INDENT_RE)?.[1] ?? "\t";
	/** @type {PackageJson} */
	let data;
	try {
		data = JSON.parse(text);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new UserError(`Invalid package.json (${file}): ${reason}`, {
			cause: error,
		});
	}
	if (!isPlainObject(data)) {
		throw new UserError(`Invalid package.json (${file}): not a JSON object`);
	}
	if (data.scripts !== undefined && !isPlainObject(data.scripts)) {
		throw new UserError(
			`Invalid package.json (${file}): "scripts" is not a JSON object`,
		);
	}
	return { data, indent };
};

/** @returns {Promise<boolean>} */
const bunOnPath = async () => {
	try {
		await capture("bun", ["--version"], process.cwd());
		return true;
	} catch {
		return false;
	}
};

/**
 * Looks for one directory's signals: the packageManager field, a lockfile, then a
 * workspace marker. Only cwd's own package.json may fail the run.
 * @param {string} dir
 * @param {boolean} strict
 * @returns {Promise<PackageManager | null>}
 */
const detectIn = async (dir, strict) => {
	let field;
	try {
		field = (await readPackageJson(dir))?.data.packageManager;
	} catch (error) {
		if (strict) {
			throw error;
		}
	}
	const named = typeof field === "string" ? field.split("@")[0] : "";
	if (named !== undefined && isPackageManager(named)) {
		return named;
	}
	const present = await Promise.all(
		LOCKS.map(([file]) => pathExists(join(dir, file))),
	);
	const locked = LOCKS.find((_lock, index) => present[index])?.[1];
	if (locked) {
		return locked;
	}
	return (await pathExists(join(dir, "pnpm-workspace.yaml"))) ? "pnpm" : null;
};

/**
 * Walks up from cwd so a workspace member follows its root.
 * @param {string} cwd
 * @returns {Promise<PackageManager>}
 */
export const detectPackageManager = async (cwd) => {
	const found = await Promise.all(
		ancestors(cwd).map((dir) => detectIn(dir, dir === cwd)),
	);
	const nearest = found.find((name) => name !== null);
	if (nearest) {
		return nearest;
	}
	return process.versions.bun || (await bunOnPath()) ? "bun" : "npm";
};

/**
 * @param {Selected} selected
 * @returns {boolean}
 */
export const hasNursery = (selected) =>
	selected.rules.some((rule) =>
		Object.keys(rule.set).some((key) => key.startsWith("nursery.")),
	);

/**
 * Nursery rules can be promoted in a minor release, which breaks config loading,
 * so they pin the minor version.
 * @param {Selected} selected
 * @returns {string}
 */
export const biomeRange = (selected) =>
	`${hasNursery(selected) ? "~" : "^"}${BIOME_VERSION}`;

/**
 * Workspace roots need a flag to accept a dependency: pnpm `-w`, yarn classic `-W`.
 * @param {Context} ctx
 * @returns {Promise<string[]>}
 */
const workspaceArgs = async ({ cwd, pm }) => {
	if (pm === "pnpm") {
		return (await pathExists(join(cwd, "pnpm-workspace.yaml"))) ? ["-w"] : [];
	}
	if (pm !== "yarn") {
		return [];
	}
	const pkg = await readPackageJson(cwd);
	const field = pkg?.data.packageManager;
	const major =
		typeof field === "string"
			? Number.parseInt(field.split("@")[1] ?? "", 10)
			: 1;
	const berry = major >= 2 || (await pathExists(join(cwd, ".yarnrc.yml")));
	return pkg?.data.workspaces !== undefined && !berry ? ["-W"] : [];
};

/**
 * @param {Context} ctx
 * @returns {Promise<void>}
 */
export const installBiome = async (ctx) => {
	const { cwd, pm, opts, report, selected } = ctx;
	const args = [
		...INSTALL_ARGS[pm],
		...(await workspaceArgs(ctx)),
		`@biomejs/biome@${biomeRange(selected)}`,
		PACKAGE_SPEC,
	];
	report.install = `${pm} ${args.join(" ")}`;
	if (opts.dryRun) {
		return;
	}
	try {
		await runInherited(pm, args, cwd);
	} catch (error) {
		const missing =
			error instanceof Error && "code" in error && error.code === "ENOENT";
		const message = error instanceof Error ? error.message : String(error);
		const reason = missing ? `${pm} was not found on PATH` : message;
		throw new UserError(
			`Install failed, the installer wrote nothing (any changes by ${pm} are its own): ${report.install} (${reason})`,
			{ cause: error },
		);
	}
};
