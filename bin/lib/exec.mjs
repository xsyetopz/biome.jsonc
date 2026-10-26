import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Runs a command and returns its stdout; rejects on a non-zero exit.
 * @param {string} file
 * @param {string[]} args
 * @param {string} cwd
 * @returns {Promise<string>}
 */
export const capture = async (file, args, cwd) => {
	const { stdout } = await execFileAsync(file, args, { cwd, encoding: "utf8" });
	return stdout;
};

/**
 * Runs a command with the terminal attached; rejects on a non-zero exit.
 * @param {string} file
 * @param {string[]} args
 * @param {string} cwd
 * @returns {Promise<void>}
 */
export const runInherited = (file, args, cwd) =>
	new Promise((resolve, reject) => {
		const child = spawn(file, args, { cwd, stdio: "inherit" });
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`exit code ${code}`));
			}
		});
	});
