import { describePlugin } from "./plugin-harness.ts";

describePlugin("noDoubleTypeAssertion", {
	bad: [
		"declare const x: number;\nexport const y = x as unknown as string;\n",
		"declare const x: number;\nexport const y = x as any as string;\n",
		"declare const x: number;\nexport const y = (x as unknown) as string;\n",
		"declare const x: number;\nexport const y = (x as any) as string;\n",
	],
	good: [
		"declare const x: number;\nexport const y = x as unknown;\n",
		"export const y = 1;\n",
	],
});
