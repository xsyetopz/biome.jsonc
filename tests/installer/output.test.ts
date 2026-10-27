import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type ParseError, parse } from "jsonc-parser";
import {
	cleanup,
	exists,
	presentPlugins,
	read,
	readRepo,
	run,
	tempDir,
} from "./helpers.ts";

let dir = "";

beforeEach(async () => {
	dir = await tempDir();
});

afterAll(cleanup);

describe("installer output", () => {
	test("writes config and scripts, and runs the guard from the package", async () => {
		const result = await run(dir);
		expect(result.code).toBe(0);
		expect(await exists(dir, "biome.jsonc")).toBe(true);
		expect(await exists(dir, ".biome")).toBe(false);
		const pkg = JSON.parse(await read(dir, "package.json"));
		expect(pkg.scripts["lint:suppressions"]).toBe("biome-json-suppressions");
		expect(pkg.scripts.lint).toContain("biome check --error-on-warnings");
		expect(pkg.scripts.lint).toContain("run lint:suppressions");
		expect(pkg.scripts["lint:fix"]).toBe(
			"biome check --write --error-on-warnings",
		);
		expect(pkg.scripts["lint:ci"]).toContain("biome ci");
		expect(result.out).toContain("biome.jsonc");
	});

	test("the package exposes the guard as a bin that runs without bun", async () => {
		const own = JSON.parse(await readRepo("package.json"));
		const file = own.bin["biome-json-suppressions"];
		expect(own.files).toContain(file.split("/")[0]);
		expect(file).toEndWith(".mjs");
		expect((await readRepo(file)).split("\n")[0]).toBe("#!/usr/bin/env node");
	});

	test("keeps comments and parses", async () => {
		await run(dir, "--rules", "all");
		const source = await readRepo("templates", "local.jsonc");
		const text = await read(dir, "biome.jsonc");
		const comments = source.match(/^\s*\/\/.*$/gm) ?? [];
		expect(comments.length).toBeGreaterThan(0);
		for (const comment of comments) {
			expect(text).toContain(comment.trim());
		}
		const errors: ParseError[] = [];
		const parsed = parse(text, errors);
		expect(errors).toEqual([]);
		expect(parsed.vcs.enabled).toBe(false);
	});

	test("applies selected rules at linter.rules paths", async () => {
		await run(dir, "--rules", "noConsole,noEnum,noBarrelFile,noReExportAll");
		const rules = parse(await read(dir, "biome.jsonc")).linter.rules;
		expect(rules.suspicious.noConsole.level).toBe("error");
		expect(rules.suspicious.noConsole.options.allow).toEqual([
			"error",
			"warn",
			"info",
		]);
		expect(rules.style.noEnum).toBe("error");
		expect(rules.performance.noBarrelFile).toBe("error");
		expect(rules.performance.noReExportAll).toBe("error");
	});

	test("registers selected plugins from the package without copies", async () => {
		const ids = await presentPlugins();
		if (ids.length === 0) {
			return;
		}
		await run(dir, "--plugins", ids.join(","));
		const plugins = parse(await read(dir, "biome.jsonc")).plugins;
		await Promise.all(
			ids.map(async (id) => {
				expect(await exists(dir, ".biome", "plugins", `${id}.grit`)).toBe(
					false,
				);
				expect(plugins).toContain(
					`./node_modules/biome-json/plugins/${id}.grit`,
				);
			}),
		);
	});

	test("a created package.json gets an npm-safe name and private", async () => {
		const named = join(dir, "My Cool_App");
		await mkdir(named);
		const result = await run(named);
		expect(result.code).toBe(0);
		const pkg = JSON.parse(await read(named, "package.json"));
		expect(pkg.name).toBe("my-cool_app");
		expect(pkg.private).toBe(true);
	});

	test.each(["@nestjs/core", "@angular/core"])(
		"%s turns useImportType off and says so",
		async (dependency) => {
			await writeFile(
				join(dir, "package.json"),
				JSON.stringify({ name: "x", devDependencies: { [dependency]: "1" } }),
			);
			const result = await run(dir);
			expect(result.out).toContain("useImportType");
			const rules = parse(await read(dir, "biome.jsonc")).linter.rules;
			expect(rules.style.useImportType).toBe("off");
		},
	);

	test("other projects keep useImportType untouched", async () => {
		await run(dir);
		const rules = parse(await read(dir, "biome.jsonc")).linter?.rules;
		expect(rules?.style?.useImportType).not.toBe("off");
	});
});
