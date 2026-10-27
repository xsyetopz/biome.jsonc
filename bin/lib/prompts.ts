import { checkbox } from "@inquirer/prompts";
import type { Item, Operation, Options } from "./types.ts";

/**
 * Gives the ids of the chosen items.
 * It returns the preset if there is one, the defaults if the run is not interactive, or else the answer of a prompt.
 */
export const pick = async (
	message: string,
	items: Item[],
	preset: string[] | null,
	interactive: boolean,
	defaults: string[],
): Promise<string[]> => {
	if (preset) {
		return preset;
	}
	if (!interactive) {
		return defaults;
	}
	return await checkbox({
		message,
		choices: items.map((item) => ({
			name: item.label,
			value: item.id,
			description: item.hint,
			checked: defaults.includes(item.id),
		})),
	});
};

/**
 * Makes one decision for all conflicts.
 * The decision gives the ids of the operations that the user accepts.
 */
export const conflictDecider =
	(
		opts: Options,
		interactive: boolean,
	): ((conflicts: Operation[]) => Promise<string[]>) =>
	async (conflicts) => {
		if (opts.force) {
			return conflicts.map((op) => op.id);
		}
		if (!interactive) {
			return [];
		}
		return await checkbox({
			message: "Replace these existing files/scripts?",
			choices: conflicts.map((op) => ({
				name: op.label,
				value: op.id,
				checked: false,
			})),
		});
	};
