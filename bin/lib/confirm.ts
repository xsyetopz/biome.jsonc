import type { Context, Operation } from "./types.ts";

/**
 * Makes one decision for all conflicts and returns the operations to apply.
 * The function reports a refused conflict as skipped.
 * It drops operations that depend on a refused conflict without a report.
 */
export const settle = async (
	ctx: Context,
	ops: Operation[],
): Promise<Operation[]> => {
	const conflicts = ops.filter((op) => op.conflict);
	if (conflicts.length === 0) {
		return ops;
	}
	const accepted = new Set(await ctx.decide(conflicts));
	const refused = new Set(
		conflicts.filter((op) => !accepted.has(op.id)).map((op) => op.id),
	);
	const dropped = (op: Operation) => op.after !== null && refused.has(op.after);
	for (const op of conflicts) {
		if (refused.has(op.id) && !dropped(op)) {
			ctx.report.skipped.push(op.skip);
		}
	}
	return ops.filter((op) => !(refused.has(op.id) || dropped(op)));
};
