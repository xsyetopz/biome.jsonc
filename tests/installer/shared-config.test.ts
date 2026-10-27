import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import {
	cleanup,
	exists,
	linkPackage,
	read,
	run,
	runBiome,
	runInstalling,
	tempDir,
} from "./helpers.ts";

let dir = "";

beforeEach(async () => {
	dir = await tempDir();
});

afterAll(cleanup);

const SHARED = "biome-json/strict";
const PLUGIN = "./node_modules/biome-json/plugins/noArrayReduce.grit";

describe("shared config", () => {
	test("a fresh install extends the package instead of copying it", async () => {
		await linkPackage(dir);
		const result = await run(dir, "--plugins", "noArrayReduce");
		expect(result.code).toBe(0);
		const config = parse(await read(dir, "biome.jsonc"));
		expect(config.extends).toEqual([SHARED]);
		expect(config.linter).toBeUndefined();
		expect(config.plugins).toEqual([PLUGIN]);
		expect(await exists(dir, ".biome", "plugins")).toBe(false);
		await writeFile(join(dir, "a.ts"), "var a = [1].reduce((x) => x, 0);\n");
		const { out, err } = await runBiome(dir, "a.ts");
		const lint = out + err;
		expect(lint).toContain("lint/suspicious/noVar");
		expect(lint).toContain("for...of");
	});

	test("the install adds the package next to Biome", async () => {
		const result = await runInstalling(dir, {}, "--dry-run");
		expect(result.out).toContain("biome-json@github:xsyetopz/biome-json");
	});

	test("a config of another origin is replaced, not migrated", async () => {
		await writeFile(join(dir, "biome.json"), '{"formatter":{"lineWidth":120}}');
		await run(dir, "--force");
		const config = parse(await read(dir, "biome.jsonc"));
		expect(config.extends).toEqual([SHARED]);
		expect(config.formatter).toBeUndefined();
	});

	test("a workspace member points plugins at the hoisted package", async () => {
		await linkPackage(dir);
		const member = join(dir, "ws");
		await mkdir(member);
		await writeFile(join(member, "package.json"), '{"name":"m"}');
		expect((await run(member, "--plugins", "noArrayReduce")).code).toBe(0);
		expect(parse(await read(member, "biome.jsonc")).plugins).toEqual([
			"../node_modules/biome-json/plugins/noArrayReduce.grit",
		]);
	});
});
