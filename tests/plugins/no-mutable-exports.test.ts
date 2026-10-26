import { describePlugin } from "./plugin-harness.ts";

describePlugin("noMutableExports", {
	bad: ["export let a = 1;\n", "export var a = 1;\n"],
	good: ["export const a = 1;\n", "let a = 1;\nexport { a };\n"],
});
