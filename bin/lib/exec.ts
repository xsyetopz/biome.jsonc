import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Runs a command and returns its stdout.
 * The promise rejects on a non-zero exit.
 */
export const capture = async (
	file: string,
	args: string[],
	cwd: string,
): Promise<string> => {
	const { stdout } = await execFileAsync(file, args, { cwd, encoding: "utf8" });
	return stdout;
};

/**
 * Runs a command with the terminal attached.
 * The promise rejects on a non-zero exit.
 */
export const runInherited = (
	file: string,
	args: string[],
	cwd: string,
): Promise<void> =>
	new Promise<void>((resolve, reject) => {
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
