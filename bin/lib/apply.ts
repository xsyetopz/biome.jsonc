import { basename, join } from "node:path";
import { pathExists } from "./fs-util.ts";
import { readPackageJson } from "./package-manager.ts";
import type { Context, Operation, PackageJson, ScriptOp } from "./types.ts";

const UNSAFE_NAME_RE = /[^a-z0-9._~-]+/g;
const EDGE_NAME_RE = /^[._-]+|[-]+$/g;

/**
 * Returns the first of `<file>.bak`, `<file>.bak.1`, ... that does not exist yet.
 */
const freeBackup = async (file: string, n = 0): Promise<string> => {
	const candidate = n === 0 ? `${file}.bak` : `${file}.bak.${n}`;
	return (await pathExists(candidate)) ? freeBackup(file, n + 1) : candidate;
};

/**
 * Names the project of a new package.json after its directory, in a form that npm accepts.
 */
const packageIdentity = (cwd: string): { name: string; private: true } => ({
	name:
		basename(cwd)
			.toLowerCase()
			.replace(UNSAFE_NAME_RE, "-")
			.replace(EDGE_NAME_RE, "") || "project",
	private: true,
});

/**
 * Gives a name and `private` to a package.json that the install step just created.
 */
export const applyPackageIdentity = async (ctx: Context): Promise<void> => {
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
 * Backs up replaced configs. Then it writes every accepted file.
 */
export const applyFiles = async (
	ctx: Context,
	ops: Operation[],
): Promise<void> => {
	const { cwd, writer } = ctx;
	const backups: string[] = [];
	const writes: { path: string; content: string }[] = [];
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
 * Applies every accepted script change in memory. Then it writes package.json one time.
 */
export const applyScripts = async (
	ctx: Context,
	ops: Operation[],
): Promise<void> => {
	const { cwd, writer } = ctx;
	const changes: ScriptOp[] = [];
	for (const op of ops) {
		if (op.kind === "script") {
			changes.push(op);
		}
	}
	if (changes.length === 0) {
		return;
	}
	// Read after the install step. The install step also edits package.json.
	const fallback: { data: PackageJson; indent: string } = {
		data: packageIdentity(cwd),
		indent: "\t",
	};
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
