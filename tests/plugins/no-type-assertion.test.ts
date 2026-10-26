import { describePlugin, describePluginsTogether } from "./plugin-harness.ts";

describePlugin("noTypeAssertion", {
	bad: [
		"declare const x: unknown;\nexport const y = x as string;\n",
		"declare const x: unknown;\nexport const y = <string>x;\n",
		"declare const z: unknown;\nexport const y = z as string as number;\n",
	],
	good: [
		"export const y = [1] as const;\n",
		"export const y = { a: 1 } as const;\n",
		'declare const x: unknown;\nexport const y = typeof x === "string" ? x : "";\n',
		'import { a as b } from "a";\nexport { b };\n',
		'import type { A as B } from "a";\nexport type { B };\n',
		"const a = 1;\nexport { a as b };\n",
		'export { a as b } from "a";\n',
	],
});

describePluginsTogether(
	["noTypeAssertion", "noDoubleTypeAssertion"],
	[
		{
			source:
				"declare const z: unknown;\nexport const y = z as unknown as string;\n",
			count: 1,
		},
		{
			source:
				"declare const z: unknown;\nexport const y = z as any as string;\n",
			count: 1,
		},
		{
			source:
				"declare const z: unknown;\nexport const y = z as string as number;\n",
			count: 1,
		},
		{
			source:
				"declare const z: unknown;\nexport const y = (z as unknown) as string;\n",
			count: 1,
		},
		{
			source:
				"declare const z: unknown;\nexport const y = (z as any) as string;\n",
			count: 1,
		},
		{
			source: "declare const z: unknown;\nexport const y = z as string;\n",
			count: 1,
		},
		{
			source:
				"declare const z: { b: unknown };\nexport const y = (z.b as { c: number }).c as number;\n",
			count: 2,
		},
	],
);
