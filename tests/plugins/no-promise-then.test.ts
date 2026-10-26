import { describePlugin } from "./plugin-harness.ts";

describePlugin("noPromiseThen", {
	bad: [
		'fetch("a").then((r) => r.ok);\n',
		"Promise.resolve(1).then((n) => n).catch(() => 0);\n",
	],
	good: [
		'const r = await fetch("a");\nexport { r };\n',
		"Promise.resolve(1).catch(() => 0);\n",
	],
});
