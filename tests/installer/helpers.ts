import {
	access,
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, which } from "bun";

/** Result of a spawned process. */
interface Spawned {
	code: number;
	out: string;
	err: string;
}

/** Absolute path of the repo root. */
export const repo = join(import.meta.dir, "..", "..");
const cli = join(repo, "bin", "biome-setup.ts");
const biome = join(repo, "node_modules", ".bin", "biome");
/** Parsed `catalog.json` of the repo. */
export const catalog = JSON.parse(
	await readFile(join(repo, "catalog.json"), "utf8"),
);

const dirs: string[] = [];

/** Creates a temporary directory that `cleanup` removes later. */
export const tempDir = async (): Promise<string> => {
	const made = await mkdtemp(join(tmpdir(), "biome-setup-"));
	dirs.push(made);
	return made;
};

/** Removes each directory that `tempDir` created. */
export const cleanup = async (): Promise<void> => {
	await Promise.all(
		dirs.map((made) => rm(made, { recursive: true, force: true })),
	);
};

/**
 * Runs a command and collects its exit code, stdout, and stderr.
 * @param env - Full environment of the child process. When unset, the child inherits the current one.
 */
export const exec = async (
	cmd: string[],
	cwd?: string,
	env?: Record<string, string>,
): Promise<Spawned> => {
	const proc = spawn(cmd, {
		...(cwd === undefined ? {} : { cwd }),
		...(env === undefined ? {} : { env }),
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { code, out, err };
};

/** Runs the installer CLI in `cwd` with `--yes` and `--no-install`. */
export const run = (cwd: string, ...args: string[]): Promise<Spawned> =>
	exec(["bun", cli, "--yes", "--no-install", "--cwd", cwd, ...args]);

const bun = which("bun") ?? "bun";

interface RunOptions {
	/** Fake executables to put on PATH next to bun. Each entry maps a name to a shell script body. */
	tools?: Record<string, string>;
}

/** Runs the installer with the install step enabled. PATH holds only bun and `tools`. */
export const runInstalling = async (
	cwd: string,
	options: RunOptions,
	...args: string[]
): Promise<Spawned> => {
	const bin = await tempDir();
	await mkdir(bin, { recursive: true });
	await symlink(bun, join(bin, "bun"));
	await Promise.all(
		Object.entries(options.tools ?? {}).map(async ([name, body]) => {
			const file = join(bin, name);
			await writeFile(file, `#!/bin/sh\n${body}\n`);
			await chmod(file, 0o755);
		}),
	);
	return exec([bun, cli, "--yes", "--cwd", cwd, ...args], cwd, {
		PATH: bin,
		HOME: bin,
	});
};

/** Makes `dir` resolve `biome-json/strict` and its plugins from this checkout. */
export const linkPackage = async (dir: string): Promise<void> => {
	await mkdir(join(dir, "node_modules"), { recursive: true });
	await symlink(repo, join(dir, "node_modules", "biome-json"));
};

/** Runs `biome check --error-on-warnings` in `cwd`. */
export const runBiome = (cwd: string, ...args: string[]): Promise<Spawned> =>
	exec([biome, "check", "--error-on-warnings", ...args], cwd);

/** Reads the UTF-8 text of `file` inside `dir`. */
export const read = (dir: string, file: string): Promise<string> =>
	readFile(join(dir, file), "utf8");

/** Reads the UTF-8 text of a file inside the repo root. */
export const readRepo = (...parts: string[]): Promise<string> =>
	readFile(join(repo, ...parts), "utf8");

/** Tells if the path made from `parts` exists. */
export const exists = async (...parts: string[]): Promise<boolean> => {
	try {
		await access(join(...parts));
		return true;
	} catch {
		return false;
	}
};

/** Lists the ids of the catalog plugins whose files exist in the repo. */
export const presentPlugins = async (): Promise<string[]> => {
	const plugins: { id: string; file: string }[] = catalog.plugins;
	const present = await Promise.all(
		plugins.map((plugin) => exists(repo, plugin.file)),
	);
	return plugins
		.filter((_plugin, index) => present[index])
		.map((plugin) => plugin.id);
};
