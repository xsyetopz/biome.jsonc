import { Command } from "commander";
import { UserError } from "./errors.ts";
import { run } from "./run.ts";

const program = new Command()
	.name("biome-json")
	.description("Add the strict Biome setup to a Node repo")
	.option("--rules <ids|all|none>", "opt-in rules to enable")
	.option("--plugins <ids|all|none>", "Grit plugins to load from the package")
	.option("--guards <ids|all|none>", "guard scripts to add to package.json")
	.option("--yes", "no prompts; unset lists use the defaults", false)
	.option(
		"--force",
		"overwrite without asking (old Biome config moves to .bak)",
		false,
	)
	.option("--no-install", "do not install @biomejs/biome and biome-json")
	.option("--no-scripts", "do not add lint scripts to package.json")
	.option("--dry-run", "print planned writes, change nothing", false)
	.option("--cwd <dir>", "target directory", process.cwd());

/**
 * Runs the command line program and sets the exit code when it fails.
 */
export const main = async (): Promise<void> => {
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
