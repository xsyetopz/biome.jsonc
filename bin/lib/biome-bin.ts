import { createRequire } from "node:module";
import { join } from "node:path";
import { capture } from "./exec.ts";
import { ancestors, pathExists, readText } from "./fs-util.ts";
import { setPath } from "./jsonc-edit.ts";
import type { Context } from "./types.ts";

const VERSION_RE = /Version:\s*(\d+\.\d+\.\d+\S*)/;

/**
 * Prefers the own binary of the project, found in cwd or in a parent for workspaces.
 * The Biome of the installer is only a fallback.
 */
const findBiome = async (
	cwd: string,
): Promise<{ bin: string; own: boolean } | null> => {
	const bins = ancestors(cwd).map((dir) =>
		join(dir, "node_modules", ".bin", "biome"),
	);
	const present = await Promise.all(bins.map((bin) => pathExists(bin)));
	const own = bins.find((_bin, index) => present[index]);
	if (own !== undefined) {
		return { bin: own, own: true };
	}
	try {
		const bin = createRequire(import.meta.url).resolve(
			"@biomejs/biome/bin/biome",
		);
		return { bin, own: false };
	} catch {
		return null;
	}
};

/**
 * Sets `$schema` in `biome.jsonc` to the version of the binary that `findBiome` finds.
 * The function does nothing when the binary is not the own binary of the project, or when it cannot read the version.
 * The template pins one schema version, but the install takes a range.
 * Because of this, newer CLIs would report a version mismatch on every run.
 */
export const syncSchemaVersion = async (ctx: Context): Promise<void> => {
	const found = await findBiome(ctx.cwd);
	if (!found?.own) {
		return;
	}
	let version: string | undefined;
	try {
		version = (await capture(found.bin, ["--version"], ctx.cwd)).match(
			VERSION_RE,
		)?.[1];
	} catch {
		return;
	}
	if (version === undefined) {
		return;
	}
	const file = join(ctx.cwd, "biome.jsonc");
	const text = await readText(file);
	const next = setPath(
		text,
		["$schema"],
		`https://biomejs.dev/schemas/${version}/schema.json`,
	);
	if (next !== text) {
		await ctx.writer.put(file, next);
	}
};

/**
 * Formats `biome.jsonc` and `package.json` with Biome when the run wrote them or installed packages.
 * The edits of jsonc-parser and the package managers write JSON that the Biome formatter rejects.
 * Because of this, a fresh install would fail its own `biome check`.
 */
export const formatWrittenFiles = async (ctx: Context): Promise<void> => {
	const files = ["biome.jsonc", "package.json"].filter(
		(file) =>
			ctx.writer.written.includes(file) ||
			(file === "package.json" && ctx.report.install !== ""),
	);
	if (files.length === 0) {
		return;
	}
	const bin = (await findBiome(ctx.cwd))?.bin;
	if (!bin) {
		ctx.report.notes.push(
			`Run \`biome format --write ${files.join(" ")}\`: no Biome binary found.`,
		);
		return;
	}
	try {
		await capture(bin, ["format", "--write", ...files], ctx.cwd);
	} catch {
		ctx.report.notes.push(
			`Run \`biome format --write ${files.join(" ")}\`: formatting failed.`,
		);
	}
};

/**
 * Checks if the Biome binary of the project supports `--error-on-warnings`.
 * @returns `ok` is false only when `biome ci --help` does not list the flag. When the check cannot run, `ok` is true and `note` tells why.
 */
export const supportsErrorOnWarnings = async (
	cwd: string,
): Promise<{ ok: boolean; note: string }> => {
	const bin = (await findBiome(cwd))?.bin;
	if (!bin) {
		return { ok: true, note: "unverified: no Biome binary found" };
	}
	try {
		const help = await capture(bin, ["ci", "--help"], cwd);
		return { ok: help.includes("--error-on-warnings"), note: "" };
	} catch {
		return { ok: true, note: "unverified: `biome ci --help` failed" };
	}
};
