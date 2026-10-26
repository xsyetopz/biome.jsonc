import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import { cleanup, exec, read, run, runBiome, tempDir } from "./helpers.ts";

let dir = "";

beforeEach(async () => {
	dir = await tempDir();
});

afterAll(cleanup);

describe("installer version control", () => {
	test("a package inside a git repo reads the root .gitignore", async () => {
		await exec(["git", "init", "-q"], dir);
		await writeFile(join(dir, ".gitignore"), "ignored.ts\n");
		const pkg = join(dir, "packages", "a");
		await mkdir(join(pkg, "src"), { recursive: true });
		await writeFile(join(pkg, "src", "ok.ts"), "export const ok = 1;\n");
		await writeFile(join(pkg, "src", "ignored.ts"), "var x = 1;\n");
		const installed = await run(pkg);
		expect(installed.code).toBe(0);
		const vcs = parse(await read(pkg, "biome.jsonc")).vcs;
		expect(vcs.enabled).not.toBe(false);
		expect(vcs.root).toBe(join("..", ".."));
		const result = await runBiome(pkg, ".");
		expect(result.out).not.toContain("ignored.ts");
		expect(result.code).toBe(0);
	});

	test("a repo root needs no vcs.root", async () => {
		await exec(["git", "init", "-q"], dir);
		await run(dir);
		const vcs = parse(await read(dir, "biome.jsonc")).vcs;
		expect(vcs.enabled).not.toBe(false);
		expect(vcs.root).toBeUndefined();
	});
});
