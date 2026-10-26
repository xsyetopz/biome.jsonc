import { createRequire } from "node:module";
import { join } from "node:path";
import { capture } from "./exec.mjs";
import { ancestors, pathExists, readText } from "./fs-util.mjs";
import { setPath } from "./jsonc-edit.mjs";

/** @typedef {import("./types.mjs").Context} Context */

const VERSION_RE = /Version:\s*(\d+\.\d+\.\d+\S*)/;

/**
 * Prefers the project's own binary, found in cwd or in a parent for workspaces;
 * the installer's own Biome is only a fallback.
 * @param {string} cwd
 * @returns {Promise<{ bin: string, own: boolean } | null>}
 */
const findBiome = async (cwd) => {
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
 * The template pins one schema version while the install takes a range, so newer
 * CLIs would report a version mismatch on every run. Follows the binary that is found.
 * @param {Context} ctx
 * @returns {Promise<void>}
 */
export const syncSchemaVersion = async (ctx) => {
	const found = await findBiome(ctx.cwd);
	if (!found?.own) {
		return;
	}
	let version;
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
 * jsonc-parser edits and package managers write JSON that Biome's formatter rejects,
 * so a fresh install would fail its own `biome check`.
 * @param {Context} ctx
 * @returns {Promise<void>}
 */
export const formatWrittenFiles = async (ctx) => {
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
 * @param {string} cwd
 * @returns {Promise<{ ok: boolean, note: string }>}
 */
export const supportsErrorOnWarnings = async (cwd) => {
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
