import { describePlugin } from "./plugin-harness.ts";

describePlugin("noFunctionDeclaration", {
	bad: [
		"function f() { return 1; }\nf();\n",
		"export function f() { return 1; }\n",
		"export async function f() { return 1; }\n",
		"async function f() { return 1; }\nf();\n",
		"function f<T>(x: T): T { return x; }\nf(1);\n",
		"function f(a: string): string { return a; }\nf('a');\n",
		"async function f(a: string): Promise<string> { return a; }\nf('a');\n",
		"function ov(a: string): void;\nfunction ov(a: number): void;\nfunction ov(a: string | number): void {}\nfunction other() { return 1; }\nother();\n",
	],
	good: [
		"const f = () => 1;\nf();\n",
		"function* g() { yield 1; }\ng();\n",
		"async function* g() { yield 1; }\ng();\n",
		"function* g<T>(x: T): Generator<T> { yield x; }\ng(1);\n",
		"function f() { return this; }\nf();\n",
		"function f() { return arguments.length; }\nf();\n",
		"export default function () { return 1; }\n",
		"export default function main() { return 1; }\n",
		"function f(a: number): number;\nfunction f(a: string): string;\n",
		"declare function f(): void;\n",
		"function f(this: Window) { return 1; }\nf.call(window);\n",
		"function ov(a: string): void;\nfunction ov(a: number): void;\nfunction ov(a: string | number): void {}\nov(1);\n",
		"export function ov(a: string): void;\nexport function ov(a: number): void;\nexport function ov(a: string | number): void {}\n",
	],
});
