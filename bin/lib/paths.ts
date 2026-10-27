import { fileURLToPath } from "node:url";

/** Absolute path of the package root. */
export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
