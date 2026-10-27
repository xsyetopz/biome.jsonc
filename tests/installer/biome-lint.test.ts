import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	cleanup,
	linkPackage,
	presentPlugins,
	run,
	runBiome,
	tempDir,
} from "./helpers.ts";

let dir = "";

beforeEach(async () => {
	dir = await tempDir();
	await linkPackage(dir);
});

afterAll(cleanup);

describe("installer under Biome", () => {
	test("produced config loads under Biome", async () => {
		const ids = await presentPlugins();
		const args = ids.length > 0 ? ["--plugins", ids.join(",")] : [];
		expect((await run(dir, ...args)).code).toBe(0);
		await mkdir(join(dir, "src"));
		await writeFile(join(dir, "src", "sum.ts"), "export const sum = 1;\n");
		const result = await runBiome(dir, "src/sum.ts");
		expect(result.code).toBe(0);
	});

	test("a fresh install with every option passes its own lint", async () => {
		await writeFile(
			join(dir, "package.json"),
			`${JSON.stringify({ name: "x", type: "module" }, null, 2)}\n`,
		);
		const installed = await run(
			dir,
			"--rules",
			"all",
			"--plugins",
			"all",
			"--guards",
			"all",
		);
		expect(installed.code).toBe(0);
		const result = await runBiome(dir, ".");
		expect(result.out).not.toContain("━━");
		expect(result.code).toBe(0);
	});
});
