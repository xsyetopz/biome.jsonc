import { describePlugin } from "./plugin-harness.ts";

describePlugin("noProcessExit", {
	bad: ["process.exit(1);\n", "process.exit();\n"],
	good: ["process.exitCode = 1;\n", "process.cwd();\n"],
});
