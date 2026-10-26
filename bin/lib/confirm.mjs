/** @typedef {import("./types.mjs").Context} Context */
/** @typedef {import("./types.mjs").Operation} Operation */

/**
 * Makes one decision for all conflicts and returns the operations to apply.
 * A refused conflict is reported as skipped; operations that depend on a refused
 * one are dropped without a report.
 * @param {Context} ctx
 * @param {Operation[]} ops
 * @returns {Promise<Operation[]>}
 */
export const settle = async (ctx, ops) => {
	const conflicts = ops.filter((op) => op.conflict);
	if (conflicts.length === 0) {
		return ops;
	}
	const accepted = new Set(await ctx.decide(conflicts));
	const refused = new Set(
		conflicts.filter((op) => !accepted.has(op.id)).map((op) => op.id),
	);
	/** @param {Operation} op */
	const dropped = (op) => op.after !== null && refused.has(op.after);
	for (const op of conflicts) {
		if (refused.has(op.id) && !dropped(op)) {
			ctx.report.skipped.push(op.skip);
		}
	}
	return ops.filter((op) => !(refused.has(op.id) || dropped(op)));
};
