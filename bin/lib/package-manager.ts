import { join } from "node:path";
import { UserError } from "./errors.ts";
import { runInherited } from "./exec.ts";
import { ancestors, pathExists, readText } from "./fs-util.ts";
import { PACKAGE_SPEC } from "./shared-config.ts";
import type {
	Context,
	PackageJson,
	PackageManager,
	Selected,
} from "./types.ts";

/** Version of Biome that the installer pins. */
export const BIOME_VERSION = "2.6.3";
const INDENT_RE = /^([ \t]+)"/m;
const INSTALL_ARGS: Record<PackageManager, string[]> = {
	npm: ["install", "-D"],
	pnpm: ["add", "-D"],
	yarn: ["add", "-D"],
	bun: ["add", "-d"],
};
/** Command that runs a package binary, for each package manager. */
export const EXEC: Record<PackageManager, string> = {
	npm: "npx",
	pnpm: "pnpm exec",
	yarn: "yarn",
	bun: "bunx",
};
const LOCKS: [string, PackageManager][] = [
	["bun.lock", "bun"],
	["bun.lockb", "bun"],
	["pnpm-lock.yaml", "pnpm"],
	["yarn.lock", "yarn"],
	["package-lock.json", "npm"],
];

const isPackageManager = (name: string): name is PackageManager =>
	Object.hasOwn(INSTALL_ARGS, name);

const isPlainObject = (value: unknown): boolean =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Reads the package.json of a directory and checks its shape.
 * @returns The parsed data with its indent, or null when the file does not exist.
 * @throws {UserError} When the file is not valid JSON, is not a JSON object, or has a `scripts` field that is not a JSON object.
 */
export const readPackageJson = async (
	cwd: string,
): Promise<{ data: PackageJson; indent: string } | null> => {
	const file = join(cwd, "package.json");
	if (!(await pathExists(file))) {
		return null;
	}
	const text = await readText(file);
	const indent = text.match(INDENT_RE)?.[1] ?? "\t";
	let data: PackageJson;
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

/**
 * Checks one directory for the packageManager field, then a lockfile, then a workspace marker.
 * Only the package.json of cwd may fail the run.
 */
const detectIn = async (
	dir: string,
	strict: boolean,
): Promise<PackageManager | null> => {
	let field: string | undefined;
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
 * Detects the package manager of the project.
 * It searches cwd and then its parent folders, so a workspace member follows its root.
 * @returns The first package manager that it finds, or `bun` when it finds none.
 * @throws {UserError} When the package.json of cwd is not valid.
 */
export const detectPackageManager = async (
	cwd: string,
): Promise<PackageManager> => {
	const found = await Promise.all(
		ancestors(cwd).map((dir) => detectIn(dir, dir === cwd)),
	);
	return found.find((name) => name !== null) ?? "bun";
};

/** Checks if a selected rule sets a nursery rule. */
export const hasNursery = (selected: Selected): boolean =>
	selected.rules.some((rule) =>
		Object.keys(rule.set).some((key) => key.startsWith("nursery.")),
	);

/**
 * Gives the version range of Biome to install.
 * A minor release can promote nursery rules. This promotion breaks config loading. So nursery rules pin the minor version.
 */
export const biomeRange = (selected: Selected): string =>
	`${hasNursery(selected) ? "~" : "^"}${BIOME_VERSION}`;

/** A workspace root needs a flag to accept a dependency: `-w` for pnpm, `-W` for yarn classic. */
const workspaceArgs = async ({ cwd, pm }: Context): Promise<string[]> => {
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
 * Installs Biome and this package with the package manager. In a dry run, it only records the command.
 * @throws {UserError} When the install command fails or the package manager is not on PATH.
 */
export const installBiome = async (ctx: Context): Promise<void> => {
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
