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

interface Spawned {
	code: number;
	out: string;
	err: string;
}

export const repo = join(import.meta.dir, "..", "..");
const cli = join(repo, "bin", "biome-setup.mjs");
const biome = join(repo, "node_modules", ".bin", "biome");
export const catalog = JSON.parse(
	await readFile(join(repo, "catalog.json"), "utf8"),
);

const dirs: string[] = [];

export const tempDir = async (): Promise<string> => {
	const made = await mkdtemp(join(tmpdir(), "biome-setup-"));
	dirs.push(made);
	return made;
};

export const cleanup = async (): Promise<void> => {
	await Promise.all(
		dirs.map((made) => rm(made, { recursive: true, force: true })),
	);
};

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

export const run = (cwd: string, ...args: string[]): Promise<Spawned> =>
	exec(["node", cli, "--yes", "--no-install", "--cwd", cwd, ...args]);

const node = which("node") ?? "node";

interface RunOptions {
	/** Fake executables to put on PATH next to node: name to shell script body. */
	tools?: Record<string, string>;
}

/** Runs the installer with the install step enabled and a PATH limited to node plus `tools`. */
export const runInstalling = async (
	cwd: string,
	options: RunOptions,
	...args: string[]
): Promise<Spawned> => {
	const bin = await tempDir();
	await mkdir(bin, { recursive: true });
	await symlink(node, join(bin, "node"));
	await Promise.all(
		Object.entries(options.tools ?? {}).map(async ([name, body]) => {
			const file = join(bin, name);
			await writeFile(file, `#!/bin/sh\n${body}\n`);
			await chmod(file, 0o755);
		}),
	);
	return exec([node, cli, "--yes", "--cwd", cwd, ...args], cwd, {
		PATH: bin,
		HOME: bin,
	});
};

export const runBiome = (cwd: string, ...args: string[]): Promise<Spawned> =>
	exec([biome, "check", "--error-on-warnings", ...args], cwd);

export const read = (dir: string, file: string): Promise<string> =>
	readFile(join(dir, file), "utf8");

export const readRepo = (...parts: string[]): Promise<string> =>
	readFile(join(repo, ...parts), "utf8");

export const exists = async (...parts: string[]): Promise<boolean> => {
	try {
		await access(join(...parts));
		return true;
	} catch {
		return false;
	}
};

export const presentPlugins = async (): Promise<string[]> => {
	const plugins: { id: string; file: string }[] = catalog.plugins;
	const present = await Promise.all(
		plugins.map((plugin) => exists(repo, plugin.file)),
	);
	return plugins
		.filter((_plugin, index) => present[index])
		.map((plugin) => plugin.id);
};
