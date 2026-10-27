/**
 * @typedef {"npm" | "pnpm" | "yarn" | "bun"} PackageManager
 * @typedef {{ id: string, label: string, hint: string }} Item
 * @typedef {Item & { set: Record<string, unknown> }} Rule
 * @typedef {Item & { file: string }} Plugin
 * @typedef {Item & { file: string, script: { name: string, command: string } }} Guard
 * @typedef {{ rules: Rule[], plugins: Plugin[], guards: Guard[] }} Catalog
 * @typedef {{ rules: Rule[], plugins: Plugin[], guards: Guard[] }} Selected
 * @typedef {{ rules?: string, plugins?: string, guards?: string, yes: boolean, force: boolean, install: boolean, scripts: boolean, dryRun: boolean, cwd: string }} Options
 * @typedef {{ name?: string, private?: boolean, packageManager?: string, workspaces?: unknown, dependencies?: Record<string, string>, devDependencies?: Record<string, string>, scripts?: Record<string, string> } & Record<string, unknown>} PackageJson
 * @typedef {{ written: string[], put: (file: string, content: string) => Promise<void>, move: (from: string, to: string) => Promise<void> }} Writer
 * @typedef {{ skipped: string[], notes: string[], install: string }} Report
 * @typedef {{ id: string, conflict: boolean, label: string, skip: string, after: string | null, note?: string }} OperationBase
 * @typedef {OperationBase & { kind: "backup", names: string[] }} BackupOp
 * @typedef {OperationBase & { kind: "write", path: string, content: string }} WriteOp
 * @typedef {OperationBase & { kind: "script", name: string, command: string }} ScriptOp
 * @typedef {BackupOp | WriteOp | ScriptOp} Operation
 * @typedef {{ cwd: string, opts: Options, pm: PackageManager, writer: Writer, decide: (conflicts: Operation[]) => Promise<string[]>, report: Report, selected: Selected }} Context
 */

export {};
