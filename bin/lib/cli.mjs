import { Command } from "commander";
import { UserError } from "./errors.mjs";
import { run } from "./run.mjs";

const program = new Command()
	.name("biome-setup")
	.description("Add the strict Biome setup to a Node repo")
	.option("--rules <ids|all|none>", "opt-in rules to enable")
	.option("--plugins <ids|all|none>", "Grit plugins to install")
	.option("--guards <ids|all|none>", "guard scripts to install")
	.option("--yes", "no prompts; unset lists use the defaults", false)
	.option("--force", "overwrite without asking", false)
	.option("--no-install", "do not install @biomejs/biome")
	.option("--no-scripts", "do not add lint scripts to package.json")
	.option("--dry-run", "print planned writes, change nothing", false)
	.option("--cwd <dir>", "target directory", process.cwd());

/** @returns {Promise<void>} */
export const main = async () => {
	try {
		program.parse();
		await run(program.opts());
	} catch (error) {
		if (error instanceof UserError) {
			process.stderr.write(`${error.message}\n`);
			process.exitCode = 1;
		} else if (error instanceof Error && error.name === "ExitPromptError") {
			process.exitCode = 130;
		} else {
			throw error;
		}
	}
};
