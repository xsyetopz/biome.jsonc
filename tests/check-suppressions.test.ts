import { afterAll, describe, expect, it } from "bun:test";
import {
	chmod,
	mkdir,
	mkdtemp,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn, which } from "bun";

const script = resolve(
	import.meta.dir,
	"..",
	"bin",
	"biome-json-suppressions.mjs",
);
const node = which("node");
const scratch: string[] = [];

afterAll(async () => {
	await Promise.all(
		scratch.map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

/** How the test starts the bin: with bun, or by its shebang with `path` as PATH. */
type Launch = { runtime: "bun" } | { runtime: "shebang"; path: string };

/** Makes a folder with the given executables. Each entry maps a name to a symlink target or a shell script body. */
const binDir = async (
	tools: Record<string, { link: string } | { sh: string }>,
) => {
	const dir = await mkdtemp(join(tmpdir(), "check-suppressions-bin-"));
	scratch.push(dir);
	await Promise.all(
		Object.entries(tools).map(async ([name, tool]) => {
			const file = join(dir, name);
			if ("link" in tool) {
				await symlink(tool.link, file);
				return;
			}
			await writeFile(file, `#!/bin/sh\n${tool.sh}\n`);
			await chmod(file, 0o755);
		}),
	);
	return dir;
};

const run = async (
	files: Record<string, string>,
	git = false,
	launch: Launch = { runtime: "bun" },
) => {
	const dir = await mkdtemp(join(tmpdir(), "check-suppressions-"));
	try {
		await Promise.all(
			Object.entries(files).map(async ([name, content]) => {
				const target = join(dir, name);
				await mkdir(dirname(target), { recursive: true });
				await writeFile(target, content);
			}),
		);
		if (git) {
			await spawn(["git", "init", "-q"], { cwd: dir }).exited;
		}
		const result = spawn({
			cmd: launch.runtime === "bun" ? ["bun", script, dir] : [script, dir],
			env:
				launch.runtime === "bun"
					? process.env
					: { ...process.env, PATH: launch.path },
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, status] = await Promise.all([
			new Response(result.stdout).text(),
			result.exited,
		]);
		return { status, stdout };
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
};

describe("check-suppressions", () => {
	it("skips node_modules and dist in a git repo that does not ignore them", async () => {
		const hit = "// @ts-ignore\nexport const a = 1;\n";
		const r = await run(
			{ "node_modules/x/a.js": hit, "dist/a.js": hit, "src/a.ts": hit },
			true,
		);
		expect(r.status).toBe(1);
		expect(r.stdout).toContain("src/a.ts:1:");
		expect(r.stdout).not.toContain("node_modules/");
		expect(r.stdout).not.toContain("dist/");
	});

	it("flags a hit at the top of a file", async () => {
		const r = await run({ "a.ts": "// @ts-ignore\nexport const a = 1;\n" });
		expect(r.status).toBe(1);
		expect(r.stdout).toContain("a.ts:1: // @ts-ignore");
		expect(r.stdout).toContain("Remove each suppression comment");
	});

	it("flags a nested hit", async () => {
		const r = await run({
			"src/deep/b.ts":
				"export const b = 1;\n\n// biome-ignore lint/suspicious/noExplicitAny: x\nexport const c: any = 1;\n",
		});
		expect(r.status).toBe(1);
		expect(r.stdout).toContain("src/deep/b.ts:3:");
	});

	it("flags a JSX comment", async () => {
		const r = await run({
			"c.tsx":
				"export const c = (\n\t<div>\n\t\t{/* eslint-disable-next-line */}\n\t</div>\n);\n",
		});
		expect(r.status).toBe(1);
		expect(r.stdout).toContain("c.tsx:3:");
	});

	it("flags a hit in a .vue file", async () => {
		const r = await run({
			"d.vue":
				"<template>\n\t<!-- biome-ignore lint: x -->\n\t<p>hi</p>\n</template>\n",
		});
		expect(r.status).toBe(1);
		expect(r.stdout).toContain("d.vue:2:");
	});

	it("flags block comments and other directive names", async () => {
		const texts = [
			"/* @ts-nocheck */",
			"/** @ts-expect-error */",
			"// oxlint-disable-next-line x",
			"// biome-ignore-all lint: x",
		];
		const results = await Promise.all(
			texts.map((text) => run({ "e.ts": `${text}\n` })),
		);
		for (const r of results) {
			expect(r.status).toBe(1);
		}
	});

	it("does not flag the text inside a string", async () => {
		const r = await run({
			"f.ts":
				"export const a = \"// biome-ignore\";\nexport const b = '/* @ts-ignore */';\nexport const c = `// eslint-disable`;\n",
		});
		expect(r.stdout).toBe("");
		expect(r.status).toBe(0);
	});

	it("flags a directive inside a multi-line block comment", async () => {
		const [jsdoc, biome] = await Promise.all([
			run({ "h.ts": "/**\n * @ts-ignore\n */\nexport const h = 1;\n" }),
			run({ "i.ts": "/*\n biome-ignore lint/x: y\n*/\nexport const i = 1;\n" }),
		]);
		expect(jsdoc.status).toBe(1);
		expect(jsdoc.stdout).toContain("h.ts:2: * @ts-ignore");
		expect(biome.status).toBe(1);
		expect(biome.stdout).toContain("i.ts:2: biome-ignore lint/x: y");
	});

	it("flags a line comment after a regex literal holding a quote", async () => {
		const results = await Promise.all([
			run({ "j.ts": 'export const r = /"/; // @ts-ignore\n' }),
			run({ "k.ts": "export const r = /'/; // @ts-ignore\n" }),
		]);
		for (const r of results) {
			expect(r.status).toBe(1);
			expect(r.stdout).toContain(":1: export const r = /");
		}
	});

	it("reads a slash after a postfix increment as division", async () => {
		const results = await Promise.all([
			run({ "n.ts": "const y = i++ / 2; // @ts-ignore\n" }),
			run({ "o.ts": "const y = a[0]-- / 2; // @ts-ignore\n" }),
		]);
		for (const r of results) {
			expect(r.status).toBe(1);
			expect(r.stdout).toContain(":1: const y = ");
		}
	});

	it("reads a slash after a closing brace as a regex", async () => {
		const r = await run({
			"p.ts": "if (a) {} /'/.test(s); // @ts-ignore\n",
		});
		expect(r.status).toBe(1);
		expect(r.stdout).toContain("p.ts:1:");
	});

	it("flags a directive after an apostrophe in JSX text", async () => {
		const r = await run({ "q.tsx": "<p>don't</p>; // @ts-ignore\n" });
		expect(r.status).toBe(1);
		expect(r.stdout).toContain("q.tsx:1:");
	});

	it("skips an unquoted url() in css and scss", async () => {
		const results = await Promise.all([
			run({
				"r.scss": "a { background: url(http://x); } // eslint-disable-line\n",
			}),
			run({
				"s.css": "a { background: url(http://x); } /* eslint-disable */\n",
			}),
		]);
		for (const r of results) {
			expect(r.status).toBe(1);
			expect(r.stdout).toContain(":1: a { background: url(http://x); }");
		}
	});

	it("flags suppressions in json, html, and graphql files", async () => {
		const files: Record<string, string> = {
			"a.jsonc": '{\n\t// biome-ignore lint: x\n\t"a": 1\n}\n',
			"b.json": '{\n\t/* biome-ignore lint: x */\n\t"a": 1\n}\n',
			"c.html": "<p>\n<!-- biome-ignore lint: x -->\n</p>\n",
			"d.graphql": "# biome-ignore lint: x\ntype A { a: Int }\n",
			"e.gql": "type A { a: Int }\n# biome-ignore lint: x\n",
		};
		const results = await Promise.all(
			Object.entries(files).map(async ([name, content]) => ({
				name,
				...(await run({ [name]: content })),
			})),
		);
		for (const r of results) {
			expect(r.status).toBe(1);
			expect(r.stdout).toContain(`${r.name}:`);
		}
	});

	it("flags a directive in html script and style content", async () => {
		const r = await run({
			"s.html":
				"<script>\n// @ts-ignore\n</script>\n<style>\n/* biome-ignore x */\n</style>\n",
		});
		expect(r.stdout).toContain("s.html:2:");
		expect(r.stdout).toContain("s.html:5:");
	});

	it("does not flag a directive inside a multi-line template literal", async () => {
		const r = await run({
			"l.ts": [
				"export const l = `a\n// @ts-ignore\n$",
				"{1 + 1} /* biome-ignore x */\n`;\n",
			].join(""),
		});
		expect(r.stdout).toBe("");
		expect(r.status).toBe(0);
	});

	it("flags a directive after a template interpolation", async () => {
		const r = await run({
			"m.ts": ["export const m = `$", "{`}`}`; // @ts-ignore\n"].join(""),
		});
		expect(r.status).toBe(1);
		expect(r.stdout).toContain("m.ts:1:");
	});

	it("skips .biome, node_modules, and dist", async () => {
		const r = await run({
			".biome/x.mjs": "// biome-ignore x\n",
			"node_modules/p/i.js": "// @ts-ignore\n",
			"dist/o.js": "// @ts-ignore\n",
		});
		expect(r.status).toBe(0);
	});

	it("checks a dist or .biome folder that is not at a package root", async () => {
		const hit = "// @ts-ignore\nexport const a = 1;\n";
		const r = await run({ "src/dist/a.ts": hit, "src/.biome/b.ts": hit }, true);
		expect(r.status).toBe(1);
		expect(r.stdout).toContain("src/dist/a.ts:1:");
		expect(r.stdout).toContain("src/.biome/b.ts:1:");
	});

	it("skips dist at a workspace package root and node_modules at any depth", async () => {
		const hit = "// @ts-ignore\n";
		const r = await run(
			{
				"packages/a/package.json": "{}",
				"packages/a/dist/o.js": hit,
				"packages/a/src/node_modules/x/i.js": hit,
			},
			true,
		);
		expect(r.status).toBe(0);
	});

	it("runs in node by its shebang when bun is not on PATH", async () => {
		expect(node).not.toBeNull();
		const tools = await binDir({ node: { link: node ?? "" } });
		const r = await run({ "a.ts": "// @ts-ignore\n" }, false, {
			runtime: "shebang",
			path: `${tools}:/usr/bin:/bin`,
		});
		expect(r.status).toBe(1);
		expect(r.stdout).toContain("a.ts:1: // @ts-ignore");
	});

	it("hands the guard to bun when node starts it and bun is on PATH", async () => {
		expect(node).not.toBeNull();
		const tools = await binDir({
			node: { link: node ?? "" },
			bun: { sh: 'echo "fake bun $*"\nexit 7' },
		});
		const r = await run({ "a.ts": "export const a = 1;\n" }, false, {
			runtime: "shebang",
			path: `${tools}:/usr/bin:/bin`,
		});
		expect(r.status).toBe(7);
		expect(r.stdout).toContain("fake bun ");
		expect(r.stdout).toContain("check-suppressions.mjs");
	});

	it("exits 0 for a clean tree", async () => {
		const r = await run({
			"g.ts": "// a normal comment\nexport const g = 1;\n",
		});
		expect(r.status).toBe(0);
		expect(r.stdout).toBe("");
	});
});
