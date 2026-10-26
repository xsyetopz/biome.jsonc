import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import { catalog, cleanup, exists, read, run, tempDir } from "./helpers.ts";

let dir = "";

beforeEach(async () => {
	dir = await tempDir();
});

afterAll(cleanup);

describe("installer flags", () => {
	test("unknown id exits 1 and lists valid ids", async () => {
		const result = await run(dir, "--rules", "nope");
		expect(result.code).toBe(1);
		expect(result.err).toContain("nope");
		expect(result.err).toContain(catalog.rules[0].id);
		expect(await readdir(dir)).toEqual([]);
	});

	test("--dry-run writes nothing", async () => {
		const result = await run(dir, "--dry-run", "--rules", "all");
		expect(result.code).toBe(0);
		expect(result.out).toContain("biome.jsonc");
		expect(await readdir(dir)).toEqual([]);
	});

	test("--no-scripts leaves lint scripts out", async () => {
		await run(dir, "--no-scripts", "--guards", "none");
		expect(await exists(dir, "package.json")).toBe(false);
	});

	test("--no-scripts adds no scripts but still copies the guard", async () => {
		const result = await run(dir, "--no-scripts");
		expect(result.code).toBe(0);
		expect(await exists(dir, ".biome", "check-suppressions.mjs")).toBe(true);
		expect(await exists(dir, "package.json")).toBe(false);
	});

	test("--no-scripts leaves an existing scripts block alone", async () => {
		await writeFile(
			join(dir, "package.json"),
			JSON.stringify({ name: "x", scripts: { test: "t" } }),
		);
		await run(dir, "--no-scripts");
		const pkg = JSON.parse(await read(dir, "package.json"));
		expect(pkg.scripts).toEqual({ test: "t" });
	});

	test("--rules and --plugins accept none, and --help says so", async () => {
		const result = await run(dir, "--rules", "none", "--plugins", "none");
		expect(result.code).toBe(0);
		expect(parse(await read(dir, "biome.jsonc")).plugins).toBeUndefined();
		const help = await run(dir, "--help");
		expect(help.out).toContain("--rules <ids|all|none>");
		expect(help.out).toContain("--plugins <ids|all|none>");
	});
});
