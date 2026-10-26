import { describePlugin } from "./plugin-harness.ts";

describePlugin("useStructuredClone", {
	bad: [
		"declare const f: (a: number, b: number) => unknown;\nexport const y = JSON.parse(JSON.stringify(f(1, 2)));\n",
		"export const y = JSON.parse(JSON.stringify({ a: 1 }));\n",
	],
	good: [
		"export const y = JSON.parse(JSON.stringify({ a: 1 }, null, 2));\n",
		"export const y = JSON.parse(JSON.stringify({ a: 1 }, (k, v) => v));\n",
		"export const y = JSON.parse(JSON.stringify({ a: 1 }), (k, v) => v);\n",
		"export const y = structuredClone({ a: 1 });\n",
		'export const y = JSON.parse("{}");\n',
		"export const y = JSON.stringify({ a: 1 });\n",
	],
});
