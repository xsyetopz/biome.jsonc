import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
	chmod,
	cp,
	mkdir,
	readdir,
	symlink,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import {
	cleanup,
	exec,
	exists,
	read,
	repo,
	runInstalling,
	tempDir,
} from "./helpers.ts";

let dir = "";

beforeEach(async () => {
	dir = await tempDir();
});

afterAll(cleanup);

const writePackage = (data: object) =>
	writeFile(join(dir, "package.json"), JSON.stringify(data));

describe("installer install step", () => {
	test("a missing package manager fails with one line and writes nothing", async () => {
		await writePackage({ name: "x", packageManager: "pnpm@9.0.0" });
		const result = await runInstalling(dir, {});
		expect(result.code).toBe(1);
		expect(result.err.trim().split("\n")).toHaveLength(1);
		expect(result.err).toContain("pnpm");
		expect(result.err).not.toContain("    at ");
		expect(await exists(dir, "biome.jsonc")).toBe(false);
		expect(await exists(dir, ".biome")).toBe(false);
		expect(await readdir(dir)).toEqual(["package.json"]);
	});

	test("a failing install exits 1 with its exit code and writes nothing", async () => {
		await writePackage({ name: "x", packageManager: "pnpm@9.0.0" });
		const result = await runInstalling(dir, { tools: { pnpm: "exit 3" } });
		expect(result.code).toBe(1);
		expect(result.err.trim().split("\n")).toHaveLength(1);
		expect(result.err).toContain("3");
		expect(result.err).toContain("the installer wrote nothing");
		expect(result.err).not.toContain("no files were changed");
		expect(await readdir(dir)).toEqual(["package.json"]);
	});

	test("without a packageManager or lockfile, bun on PATH is used", async () => {
		const result = await runInstalling(
			dir,
			{ tools: { bun: "exit 0" } },
			"--dry-run",
		);
		expect(result.out).toContain("Would run: bun add -d @biomejs/biome@");
	});

	test("without a packageManager, lockfile or bun, npm is used", async () => {
		const result = await runInstalling(dir, {}, "--dry-run");
		expect(result.out).toContain("Would run: npm install -D @biomejs/biome@");
	});

	test("pnpm adds -w when pnpm-workspace.yaml exists", async () => {
		await writePackage({ name: "x", packageManager: "pnpm@9.0.0" });
		await writeFile(join(dir, "pnpm-workspace.yaml"), "packages: []\n");
		const result = await runInstalling(dir, {}, "--dry-run");
		expect(result.out).toContain("Would run: pnpm add -D -w @biomejs/biome@");
	});

	test("pnpm adds no -w outside a workspace", async () => {
		await writePackage({ name: "x", packageManager: "pnpm@9.0.0" });
		const result = await runInstalling(dir, {}, "--dry-run");
		expect(result.out).toContain("Would run: pnpm add -D @biomejs/biome@");
	});

	test("yarn adds -W when package.json has workspaces", async () => {
		await writePackage({
			name: "x",
			packageManager: "yarn@1.22.22",
			workspaces: ["packages/*"],
		});
		const result = await runInstalling(dir, {}, "--dry-run");
		expect(result.out).toContain("Would run: yarn add -D -W @biomejs/biome@");
	});

	test("yarn berry adds no -W", async () => {
		await writePackage({
			name: "x",
			packageManager: "yarn@4.1.0",
			workspaces: ["packages/*"],
		});
		const result = await runInstalling(dir, {}, "--dry-run");
		expect(result.out).toContain("Would run: yarn add -D @biomejs/biome@");
	});

	test("nursery rules pin a tilde range and print a migrate note", async () => {
		await writePackage({ name: "x", packageManager: "bun@1.4.4" });
		const result = await runInstalling(
			dir,
			{},
			"--dry-run",
			"--rules",
			"noFloatingPromises",
		);
		expect(result.out).toContain("Would run: bun add -d @biomejs/biome@~2.");
		expect(result.out).toContain("biome migrate --write");
	});

	test("without nursery rules the range stays a caret", async () => {
		await writePackage({ name: "x", packageManager: "bun@1.4.4" });
		const result = await runInstalling(
			dir,
			{},
			"--dry-run",
			"--rules",
			"noConsole",
		);
		expect(result.out).toContain("Would run: bun add -d @biomejs/biome@^2.");
		expect(result.out).not.toContain("biome migrate");
	});

	test("$schema follows the Biome version that was found", async () => {
		const bin = join(dir, "node_modules", ".bin");
		await mkdir(bin, { recursive: true });
		await writeFile(join(bin, "biome"), '#!/bin/sh\necho "Version: 9.8.7"\n');
		await chmod(join(bin, "biome"), 0o755);
		const result = await runInstalling(dir, {}, "--no-install");
		expect(result.code).toBe(0);
		expect(parse(await read(dir, "biome.jsonc")).$schema).toBe(
			"https://biomejs.dev/schemas/9.8.7/schema.json",
		);
	});

	test("a workspace member follows the packageManager of the workspace root", async () => {
		await writePackage({ name: "r", packageManager: "pnpm@9.0.0" });
		await writeFile(join(dir, "pnpm-workspace.yaml"), "packages: [ws]\n");
		const member = join(dir, "ws");
		await mkdir(member);
		await writeFile(join(member, "package.json"), '{"name":"m"}');
		const result = await runInstalling(member, {}, "--dry-run");
		expect(result.out).toContain("Would run: pnpm add -D @biomejs/biome@");
		expect(result.out).not.toContain(" -w ");
	});

	test("a workspace marker or lockfile above cwd picks the package manager", async () => {
		await writeFile(join(dir, "pnpm-workspace.yaml"), "packages: [a]\n");
		await mkdir(join(dir, "a", "deep"), { recursive: true });
		const marker = await runInstalling(join(dir, "a", "deep"), {}, "--dry-run");
		expect(marker.out).toContain("Would run: pnpm add -D @biomejs/biome@");
		const other = await tempDir();
		await writeFile(join(other, "yarn.lock"), "");
		await mkdir(join(other, "a"));
		const locked = await runInstalling(join(other, "a"), {}, "--dry-run");
		expect(locked.out).toContain("Would run: yarn add -D @biomejs/biome@");
	});

	test("a package.json that is not an object fails naming the file", async () => {
		const texts = ["null", "[]", '"x"', '{"scripts":"x"}'];
		await Promise.all(
			texts.map(async (text) => {
				const sub = await tempDir();
				await writeFile(join(sub, "package.json"), text);
				const result = await runInstalling(sub, {}, "--no-install");
				expect(result.code).toBe(1);
				expect(result.err).toContain(join(sub, "package.json"));
				expect(result.err).not.toContain("    at ");
				expect(await read(sub, "package.json")).toBe(text);
			}),
		);
	});

	test("$schema is not synced to the installer's own Biome", async () => {
		const copy = await tempDir();
		await Promise.all(
			["bin", "catalog.json", "templates", "plugins"].map((name) =>
				cp(join(repo, name), join(copy, name), { recursive: true }),
			),
		);
		const modules = join(copy, "node_modules");
		const fake = join(modules, "@biomejs", "biome");
		await mkdir(join(fake, "bin"), { recursive: true });
		await writeFile(join(fake, "package.json"), '{"name":"@biomejs/biome"}');
		await writeFile(
			join(fake, "bin", "biome"),
			'#!/bin/sh\necho "Version: 9.8.7"\n',
		);
		await chmod(join(fake, "bin", "biome"), 0o755);
		const shared = (await readdir(join(repo, "node_modules"))).filter(
			(name) => name !== "@biomejs",
		);
		await Promise.all(
			shared.map((name) =>
				symlink(join(repo, "node_modules", name), join(modules, name)),
			),
		);
		const project = await tempDir();
		const result = await exec(
			[
				"node",
				join(copy, "bin", "biome-setup.mjs"),
				"--yes",
				"--no-install",
				"--cwd",
				project,
			],
			project,
		);
		expect(result.code).toBe(0);
		expect(parse(await read(project, "biome.jsonc")).$schema).toBe(
			"https://biomejs.dev/schemas/2.6.3/schema.json",
		);
	});
});
