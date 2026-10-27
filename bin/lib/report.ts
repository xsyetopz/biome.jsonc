import { describe } from "./catalog.ts";
import { EXEC } from "./package-manager.ts";
import type { Context } from "./types.ts";

/** Writes one line to stdout. */
export const say = (line = "") => {
	process.stdout.write(`${line}\n`);
};

/** Prints the result of the run: written files, install command, notes, skips, selections, and the next command. */
export const printReport = (ctx: Context, configWritten: boolean) => {
	const { writer, report, pm, opts, selected } = ctx;
	if (opts.dryRun) {
		say("Planned writes (dry run, nothing changed):");
	} else if (writer.written.length > 0) {
		say("Written:");
	}
	for (const file of writer.written) {
		say(`  ${file}`);
	}
	if (report.install) {
		say(`${opts.dryRun ? "Would run" : "Ran"}: ${report.install}`);
	}
	for (const line of report.notes) {
		say(`Note: ${line}`);
	}
	for (const line of report.skipped) {
		say(`Skipped: ${line}`);
	}
	const hasLint = opts.scripts && configWritten;
	const next = hasLint
		? `${pm} run lint`
		: `${EXEC[pm]} biome check --error-on-warnings`;
	say(`Selections: ${describe(selected)}`);
	say(`Next: ${next}`);
};
