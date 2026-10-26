import { basename, join } from "node:path";
import { pathExists } from "./fs-util.mjs";
import { readPackageJson } from "./package-manager.mjs";

/** @typedef {import("./types.mjs").Context} Context */
/** @typedef {import("./types.mjs").Operation} Operation */
/** @typedef {import("./types.mjs").PackageJson} PackageJson */

const UNSAFE_NAME_RE = /[^a-z0-9._~-]+/g;
const EDGE_NAME_RE = /^[._-]+|[-]+$/g;

/**
 * First of `<file>.bak`, `<file>.bak.1`, ... that does not exist yet.
 * @param {string} file
 * @param {number} [n]
 * @returns {Promise<string>}
 */
const freeBackup = async (file, n = 0) => {
	const candidate = n === 0 ? `${file}.bak` : `${file}.bak.${n}`;
	return (await pathExists(candidate)) ? freeBackup(file, n + 1) : candidate;
};

/**
 * A new package.json names the project after its directory, in a form npm accepts.
 * @param {string} cwd
 * @returns {{ name: string, private: true }}
 */
const packageIdentity = (cwd) => ({
	name:
		basename(cwd)
			.toLowerCase()
			.replace(UNSAFE_NAME_RE, "-")
			.replace(EDGE_NAME_RE, "") || "project",
	private: true,
});

/**
 * Gives a package.json that the install step just created a name and `private`.
 * @param {Context} ctx
 * @returns {Promise<void>}
 */
export const applyPackageIdentity = async (ctx) => {
	const { cwd, writer } = ctx;
	const pkg = await readPackageJson(cwd);
	if (pkg === null) {
		return;
	}
	const next = { ...packageIdentity(cwd), ...pkg.data };
	await writer.put(
		join(cwd, "package.json"),
		`${JSON.stringify(next, null, pkg.indent)}\n`,
	);
};

/**
 * Backs up replaced configs, then writes every accepted file.
 * @param {Context} ctx
 * @param {Operation[]} ops
 * @returns {Promise<void>}
 */
export const applyFiles = async (ctx, ops) => {
	const { cwd, writer } = ctx;
	/** @type {string[]} */
	const backups = [];
	/** @type {{ path: string, content: string }[]} */
	const writes = [];
	for (const op of ops) {
		switch (op.kind) {
			case "backup":
				backups.push(...op.names);
				break;
			case "write":
				writes.push(op);
				break;
			case "script":
				break;
		}
	}
	await Promise.all(
		backups.map(async (name) =>
			writer.move(join(cwd, name), await freeBackup(join(cwd, name))),
		),
	);
	await Promise.all(writes.map((op) => writer.put(op.path, op.content)));
};

/**
 * Applies every accepted script change in memory and writes package.json once.
 * @param {Context} ctx
 * @param {Operation[]} ops
 * @returns {Promise<void>}
 */
export const applyScripts = async (ctx, ops) => {
	const { cwd, writer } = ctx;
	const changes = [];
	for (const op of ops) {
		if (op.kind === "script") {
			changes.push(op);
		}
	}
	if (changes.length === 0) {
		return;
	}
	// Read after the install step, which also edits package.json.
	/** @type {{ data: PackageJson, indent: string }} */
	const fallback = { data: packageIdentity(cwd), indent: "\t" };
	const pkg = (await readPackageJson(cwd)) ?? fallback;
	const scripts = { ...pkg.data.scripts };
	for (const op of changes) {
		scripts[op.name] = op.command;
	}
	const next = { ...pkg.data, scripts };
	await writer.put(
		join(cwd, "package.json"),
		`${JSON.stringify(next, null, pkg.indent)}\n`,
	);
};
