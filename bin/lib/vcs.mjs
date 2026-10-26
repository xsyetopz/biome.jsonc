import { realpath } from "node:fs/promises";
import { relative, sep } from "node:path";
import { capture } from "./exec.mjs";
import { setPath } from "./jsonc-edit.mjs";

const REMOTE_PREFIX_RE = /^[^/]+\//;

/**
 * @param {string} cwd
 * @returns {Promise<string | null>}
 */
const gitDefaultBranch = async (cwd) => {
	try {
		const ref = (
			await capture(
				"git",
				["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
				cwd,
			)
		).trim();
		return ref.replace(REMOTE_PREFIX_RE, "") || null;
	} catch {
		return null;
	}
};

/**
 * @param {string} cwd
 * @returns {Promise<string | null>}
 */
const gitTopLevel = async (cwd) => {
	try {
		const top = (
			await capture("git", ["rev-parse", "--show-toplevel"], cwd)
		).trim();
		return top || null;
	} catch {
		return null;
	}
};

/**
 * Inside a git repo, `vcs.root` points Biome at the top level when the config sits
 * in a package below it, so the root .gitignore still applies.
 * @param {string} text
 * @param {string} cwd
 * @returns {Promise<string>}
 */
export const applyVcs = async (text, cwd) => {
	const top = await gitTopLevel(cwd);
	if (top === null) {
		return setPath(text, ["vcs", "enabled"], false);
	}
	const root = relative(await realpath(cwd), await realpath(top));
	const rooted =
		root === ""
			? text
			: setPath(text, ["vcs", "root"], root.split(sep).join("/"));
	const branch = await gitDefaultBranch(cwd);
	return branch ? setPath(rooted, ["vcs", "defaultBranch"], branch) : rooted;
};
