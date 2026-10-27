import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyEdits, modify, parse } from "jsonc-parser";
import {
	cleanup,
	exists,
	linkPackage,
	read,
	readRepo,
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

/** A config as the installer wrote it before `extends`. It has the whole template, with edits. */
const writeOldCopy = async (): Promise<string> => {
	let text = await readRepo("templates", "strict.jsonc");
	const set = (path: string[], value: unknown) => {
		text = applyEdits(text, modify(text, path, value, {}));
	};
	set(["linter", "rules", "style", "noEnum"], "error");
	set(["linter", "rules", "suspicious", "noVar"], "off");
	set(["linter", "rules", "complexity", "noForEach"], undefined);
	set(["vcs", "enabled"], false);
	set(["plugins"], ["./.biome/plugins/noArrayReduce.grit"]);
	await mkdir(join(dir, ".biome", "plugins"), { recursive: true });
	await writeFile(
		join(dir, ".biome", "plugins", "noArrayReduce.grit"),
		await readRepo("plugins", "noArrayReduce.grit"),
	);
	await writeFile(join(dir, "biome.jsonc"), text);
	return text;
};

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
		expect(result.out).toContain("biome-json@github:xsyetopz/biome.jsonc");
	});

	test("migrates a full template copy to its repo settings only", async () => {
		const old = await writeOldCopy();
		await linkPackage(dir);
		const result = await run(dir, "--force");
		expect(result.code).toBe(0);
		expect(await read(dir, "biome.jsonc.bak")).toBe(old);
		const config = parse(await read(dir, "biome.jsonc"));
		expect(config.extends).toEqual([SHARED]);
		expect(config.linter.rules).toEqual({
			style: { noEnum: "error" },
			suspicious: { noVar: "off" },
		});
		expect(config.vcs).toEqual({ enabled: false });
		expect(config.plugins).toEqual([PLUGIN]);
		expect(config.files).toBeUndefined();
		expect(config.overrides).toBeUndefined();
		await writeFile(
			join(dir, "a.ts"),
			"var a = [1].reduce((x) => x, 0);\nexport enum E { A = 0 }\n[a].forEach((v) => String(v));\n",
		);
		const { out, err } = await runBiome(dir, "a.ts");
		const lint = out + err;
		expect(lint).not.toContain("lint/suspicious/noVar");
		expect(lint).toContain("lint/style/noEnum");
		expect(lint).toContain("lint/complexity/noForEach");
		expect(lint).toContain("for...of");
	});

	test("a second run keeps the migrated settings", async () => {
		await writeOldCopy();
		await run(dir, "--force");
		const first = parse(await read(dir, "biome.jsonc"));
		expect((await run(dir, "--force", "--plugins", "noArrayReduce")).code).toBe(
			0,
		);
		expect(parse(await read(dir, "biome.jsonc"))).toEqual(first);
	});

	test("a plugin copy that was edited stays in use", async () => {
		await writeOldCopy();
		await writeFile(
			join(dir, ".biome", "plugins", "noArrayReduce.grit"),
			"// mine\n",
		);
		await run(dir, "--force");
		expect(parse(await read(dir, "biome.jsonc")).plugins).toEqual([
			"./.biome/plugins/noArrayReduce.grit",
		]);
	});

	test("an edited copy is not loaded twice when its plugin is selected", async () => {
		await writeOldCopy();
		await writeFile(
			join(dir, ".biome", "plugins", "noArrayReduce.grit"),
			"// mine\n",
		);
		await run(dir, "--force", "--plugins", "noArrayReduce");
		expect(parse(await read(dir, "biome.jsonc")).plugins).toEqual([
			"./.biome/plugins/noArrayReduce.grit",
		]);
	});

	test("migration keeps other extends, custom overrides and the active config", async () => {
		let text = await writeOldCopy();
		const custom = { includes: ["**/*.test.ts"], linter: { enabled: false } };
		const set = (path: (string | number)[], value: unknown) => {
			text = applyEdits(
				text,
				modify(text, path, value, { isArrayInsertion: true }),
			);
		};
		set(["overrides", 0], custom);
		set(["extends"], ["./base.jsonc"]);
		set(["plugins", 0], { path: "./x.grit" });
		set(["linter", "rules", "performance"], undefined);
		await writeFile(join(dir, "biome.jsonc"), text);
		await writeFile(join(dir, "biome.json"), text);
		const result = await run(dir, "--force");
		const config = parse(await read(dir, "biome.jsonc"));
		expect(config.extends).toEqual([SHARED, "./base.jsonc"]);
		expect(config.overrides).toEqual([custom]);
		expect(config.plugins).toEqual([{ path: "./x.grit" }, PLUGIN]);
		// These are the 4 performance rules and noForEach.
		expect(result.out).toContain("lacked now apply: 5");
	});

	test("only the config Biome loads is migrated", async () => {
		await writeOldCopy();
		await writeFile(join(dir, "biome.json"), '{"formatter":{"lineWidth":120}}');
		await run(dir, "--force");
		const config = parse(await read(dir, "biome.jsonc"));
		expect(config.linter).toBeUndefined();
		expect(config.formatter).toBeUndefined();
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
