import { realpath } from "node:fs/promises";
import { relative, sep } from "node:path";
import { capture } from "./exec.ts";
import { setPath } from "./jsonc-edit.ts";

const REMOTE_PREFIX_RE = /^[^/]+\//;

const gitDefaultBranch = async (cwd: string): Promise<string | null> => {
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

const gitTopLevel = async (cwd: string): Promise<string | null> => {
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
 * Sets the vcs options of the config text.
 * Outside git, it sets `vcs.enabled` to false.
 * In a git repo, `vcs.root` points Biome at the top level when the config is in a package below it.
 * Then the root .gitignore still applies.
 * When `origin/HEAD` exists, it also sets `vcs.defaultBranch` to that branch.
 */
export const applyVcs = async (text: string, cwd: string): Promise<string> => {
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
