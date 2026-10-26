import { describePlugin } from "./plugin-harness.ts";

describePlugin("useSwitchForEqualityChain", {
	bad: [
		'declare const x: string;\nif (x === "a") {\n\tf();\n} else if (x === "b") {\n\tg();\n}\nfunction f() {}\nfunction g() {}\n',
		'declare const x: string;\nif (x === "a") {\n\tf();\n} else if (x === "b") {\n\tg();\n} else {\n\th();\n}\nfunction f() {}\nfunction g() {}\nfunction h() {}\n',
		'declare const x: string;\nif ("a" === x) {\n\tf();\n} else if ("b" === x) {\n\tg();\n}\nfunction f() {}\nfunction g() {}\n',
		'declare const x: string;\nif (x === "a") {\n\tf();\n} else if (x === "b") {\n\tg();\n} else if (x === "c") {\n\th();\n}\nfunction f() {}\nfunction g() {}\nfunction h() {}\n',
	],
	good: [
		"declare const a: number;\ndeclare const b: number;\ndeclare const c: number;\ndeclare const d: number;\nif (a === b) {\n\tf();\n} else if (c === d) {\n\tg();\n}\nfunction f() {}\nfunction g() {}\n",
		'declare const x: string;\nif (x === "a") {\n\tf();\n}\nfunction f() {}\n',
		"declare const x: number;\nif (x < 1) {\n\tf();\n} else if (x > 5) {\n\tg();\n}\nfunction f() {}\nfunction g() {}\n",
		"declare const x: number;\nif (x !== 1) {\n\tf();\n} else if (x !== 2) {\n\tg();\n}\nfunction f() {}\nfunction g() {}\n",
		"declare const x: number;\ndeclare const y: number;\nif (x === 1 && y === 1) {\n\tf();\n} else if (x === 2 || y === 2) {\n\tg();\n}\nfunction f() {}\nfunction g() {}\n",
		'declare const x: string;\nif (x === "a") {\n\tf();\n} else {\n\tg();\n}\nfunction f() {}\nfunction g() {}\n',
		"declare const x: number;\ndeclare const y: number;\nif (x === 1) {\n\tf();\n}\nif (y === 2) {\n\tg();\n}\nfunction f() {}\nfunction g() {}\n",
		"declare const x: number;\nif (x === 1) {\n\tf();\n}\nf();\nif (x === 2) {\n\tg();\n}\nfunction f() {}\nfunction g() {}\n",
	],
});
