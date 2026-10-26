import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "bun";

const root = resolve(import.meta.dir, "..", "..");
const biome = join(root, "node_modules", ".bin", "biome");

export interface PluginCases {
	bad: string[];
	good: string[];
}

const diagnosticCount = (text: string): number => {
	try {
		const report: unknown = JSON.parse(text);
		if (
			typeof report === "object" &&
			report !== null &&
			"diagnostics" in report &&
			Array.isArray(report.diagnostics)
		) {
			return report.diagnostics.length;
		}
	} catch {
		return Number.NaN;
	}
	return Number.NaN;
};

const lint = async (plugins: string[], source: string) => {
	const dir = await mkdtemp(join(tmpdir(), "biome-plugin-"));
	try {
		await writeFile(
			join(dir, "biome.json"),
			JSON.stringify({
				linter: { rules: { preset: "none" } },
				plugins: plugins.map((plugin) =>
					join(root, "plugins", `${plugin}.grit`),
				),
			}),
		);
		await writeFile(join(dir, "input.ts"), source);
		const run = spawn({
			cmd: [biome, "lint", "--reporter=json", "--colors=off", "input.ts"],
			cwd: dir,
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, status] = await Promise.all([
			new Response(run.stdout).text(),
			run.exited,
		]);
		return { status, count: diagnosticCount(stdout) };
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
};

export const describePlugin = (plugin: string, { bad, good }: PluginCases) => {
	describe(plugin, () => {
		for (const [i, source] of bad.entries()) {
			it(`flags bad snippet ${i}`, async () => {
				const result = await lint([plugin], source);
				expect(result.count).toBeGreaterThanOrEqual(1);
				expect(result.status).toBe(1);
			});
		}
		for (const [i, source] of good.entries()) {
			it(`allows good snippet ${i}`, async () => {
				const result = await lint([plugin], source);
				expect(result.count).toBe(0);
				expect(result.status).toBe(0);
			});
		}
	});
};

export const describePluginsTogether = (
	plugins: string[],
	cases: { source: string; count: number }[],
) => {
	describe(plugins.join(" + "), () => {
		for (const [i, { source, count }] of cases.entries()) {
			it(`reports ${count} diagnostics for snippet ${i}`, async () => {
				const result = await lint(plugins, source);
				expect(result.count).toBe(count);
			});
		}
	});
};
