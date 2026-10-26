import { describePlugin } from "./plugin-harness.ts";

describePlugin("noArrayReduce", {
	bad: [
		"export const y = [1, 2].reduce((a, b) => a + b, 0);\n",
		"export const y = [1, 2].reduceRight((a, b) => a + b);\n",
	],
	good: [
		"let y = 0;\nfor (const n of [1, 2]) y += n;\nexport { y };\n",
		"export const y = [1, 2].map((n) => n * 2);\n",
	],
});
