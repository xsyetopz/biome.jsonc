import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanup, exists, read, run, tempDir } from "./helpers.ts";

let dir = "";

beforeEach(async () => {
	dir = await tempDir();
});

afterAll(cleanup);

describe("installer with existing files", () => {
	test("backs up an existing config only with --force", async () => {
		await writeFile(join(dir, "biome.json"), '{"old":true}\n');
		const refused = await run(dir);
		expect(refused.code).toBe(0);
		expect(refused.out).toContain("Skipped");
		expect(await read(dir, "biome.json")).toBe('{"old":true}\n');
		expect(await exists(dir, "biome.jsonc")).toBe(false);

		const forced = await run(dir, "--force");
		expect(forced.code).toBe(0);
		expect(await exists(dir, "biome.json")).toBe(false);
		expect(await read(dir, "biome.json.bak")).toBe('{"old":true}\n');
		expect(await exists(dir, "biome.jsonc")).toBe(true);
	});

	test("does not overwrite differing scripts without --force", async () => {
		const pkg = { name: "x", scripts: { lint: "eslint ." } };
		await writeFile(join(dir, "package.json"), JSON.stringify(pkg));
		const result = await run(dir);
		expect(result.out).toContain("script lint");
		expect(JSON.parse(await read(dir, "package.json")).scripts.lint).toBe(
			"eslint .",
		);
		await run(dir, "--force");
		expect(JSON.parse(await read(dir, "package.json")).scripts.lint).toContain(
			"biome check",
		);
	});

	test("ignores a packageManager name that is an inherited object key", async () => {
		const pkg = { name: "x", packageManager: "toString@1.0.0" };
		await writeFile(join(dir, "package.json"), JSON.stringify(pkg));
		const result = await run(dir);
		expect(result.code).toBe(0);
		expect(result.out).toContain("Next: bun run lint");
		expect(JSON.parse(await read(dir, "package.json")).scripts.lint).toContain(
			"&& bun run lint:suppressions",
		);
	});

	test("omits the Written header when nothing was written", async () => {
		await writeFile(join(dir, "biome.json"), '{"old":true}\n');
		const result = await run(dir, "--no-scripts");
		expect(result.code).toBe(0);
		expect(result.out).toContain("Skipped:");
		expect(result.out).not.toContain("Written:");
	});

	test("skips every conflict without --force and reports each", async () => {
		await writeFile(join(dir, "biome.json"), '{"old":true}\n');
		const pkg = { name: "x", scripts: { lint: "eslint .", "lint:fix": "fix" } };
		await writeFile(join(dir, "package.json"), JSON.stringify(pkg));
		const result = await run(dir);
		expect(result.code).toBe(0);
		expect(result.out).toContain("Skipped: biome.jsonc, rules and plugins");
		expect(result.out).toContain("Skipped: script lint: differs");
		expect(result.out).toContain("Skipped: script lint:fix: differs");
		expect(await read(dir, "biome.json")).toBe('{"old":true}\n');
		expect(await exists(dir, "biome.jsonc")).toBe(false);
		const scripts = JSON.parse(await read(dir, "package.json")).scripts;
		expect(scripts.lint).toBe("eslint .");
		expect(scripts["lint:fix"]).toBe("fix");
	});

	test("replaces the guard script of an older install and keeps its copy", async () => {
		await mkdir(join(dir, ".biome"));
		await writeFile(join(dir, ".biome", "check-suppressions.mjs"), "// old\n");
		const old = "node .biome/check-suppressions.mjs";
		const pkg = { name: "x", scripts: { "lint:suppressions": old } };
		await writeFile(join(dir, "package.json"), JSON.stringify(pkg));
		const result = await run(dir);
		expect(result.code).toBe(0);
		const scripts = JSON.parse(await read(dir, "package.json")).scripts;
		expect(scripts["lint:suppressions"]).toBe("biome-json-suppressions");
		expect(await read(dir, ".biome/check-suppressions.mjs")).toBe("// old\n");
		expect(result.out).toContain(
			"Note: .biome/check-suppressions.mjs is no longer needed",
		);
	});

	test("keeps another script that runs the old guard copy without --force", async () => {
		const old = "node .biome/check-suppressions.mjs";
		const pkg = { name: "x", scripts: { lint: old } };
		await writeFile(join(dir, "package.json"), JSON.stringify(pkg));
		const result = await run(dir);
		expect(result.out).toContain("Skipped: script lint: differs");
		expect(JSON.parse(await read(dir, "package.json")).scripts.lint).toBe(old);
	});

	test("keeps an existing .bak and picks a free backup name", async () => {
		await writeFile(join(dir, "biome.json"), '{"old":true}\n');
		await writeFile(join(dir, "biome.json.bak"), '{"older":true}\n');
		const forced = await run(dir, "--force");
		expect(forced.code).toBe(0);
		expect(await read(dir, "biome.json.bak")).toBe('{"older":true}\n');
		expect(await read(dir, "biome.json.bak.1")).toBe('{"old":true}\n');
		await writeFile(join(dir, "biome.json"), '{"newest":true}\n');
		await run(dir, "--force");
		expect(await read(dir, "biome.json.bak.2")).toBe('{"newest":true}\n');
		expect(await read(dir, "biome.json.bak.1")).toBe('{"old":true}\n');
	});

	test("an invalid package.json exits 1 naming the file", async () => {
		await writeFile(join(dir, "package.json"), '{\n// note\n"name": "x"\n}\n');
		const result = await run(dir);
		expect(result.code).toBe(1);
		expect(result.err).toContain("package.json");
		expect(result.err).not.toContain("    at ");
		expect(await exists(dir, "biome.jsonc")).toBe(false);
	});
});
