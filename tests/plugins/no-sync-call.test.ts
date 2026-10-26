import { describePlugin } from "./plugin-harness.ts";

describePlugin("noSyncCall", {
	bad: [
		'import { readFileSync } from "node:fs";\nreadFileSync("a");\n',
		'import fs from "node:fs";\nfs.writeFileSync("a", "b");\n',
		'import { execSync } from "node:child_process";\nexecSync("ls");\n',
		'import { statSync } from "node:fs";\nstatSync("a");\n',
		'import fs from "node:fs";\nfs.mkdirSync("a");\n',
		'import { gzipSync } from "node:zlib";\ngzipSync("a");\n',
		'import { scryptSync } from "node:crypto";\nscryptSync("a", "b", 8);\n',
		'import cp from "node:child_process";\ncp.spawnSync("ls");\n',
		'import { hkdfSync } from "node:crypto";\nhkdfSync("sha256", "a", "b", "c", 8);\n',
		'import { generateKeySync } from "node:crypto";\ngenerateKeySync("aes", { length: 128 });\n',
		'import { generatePrimeSync } from "node:crypto";\ngeneratePrimeSync(8);\n',
		'import { checkPrimeSync } from "node:crypto";\ncheckPrimeSync(1n);\n',
		'import { globSync } from "node:fs";\nglobSync("*");\n',
		'import fs from "node:fs";\nfs?.readFileSync("x");\n',
		'import fs from "node:fs";\nfs.readFileSync?.("x");\n',
		'import fs from "node:fs";\nfs?.readFileSync?.("x");\n',
	],
	good: [
		'import { flushSync } from "react-dom";\nflushSync(() => 1);\n',
		"declare const isInSync: (n: number) => boolean;\nisInSync(1);\n",
		"declare const o: { isInSync(n: number): boolean };\no.isInSync(1);\n",
		'import { readFile } from "node:fs/promises";\nawait readFile("a");\n',
		"export const y = Math.max(1, 2);\n",
	],
});
