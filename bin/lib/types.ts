/** Names a package manager that the setup supports. */
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/** Describes one entry of the catalog that the user can select. */
export interface Item {
	/** Identifier of the item. */
	id: string;
	/** Name that a prompt shows. */
	label: string;
	/** Description that a prompt shows. */
	hint: string;
}

/** Holds an opt-in lint rule with the biome.jsonc settings that enable it. */
export type Rule = Item & { set: Record<string, unknown> };

/** Holds a Grit plugin with its packaged file. */
export type Plugin = Item & { file: string };

/** Holds a guard with the package.json script that runs it. */
export type Guard = Item & { script: { name: string; command: string } };

/** Holds every rule, plugin, and guard that the user can select. */
export interface Catalog {
	rules: Rule[];
	plugins: Plugin[];
	guards: Guard[];
}

/** Holds the rules, plugins, and guards that the user selected. */
export interface Selected {
	rules: Rule[];
	plugins: Plugin[];
	guards: Guard[];
}

/** Holds the command line options of the setup. */
export interface Options {
	/** Value of the `--rules` option. */
	rules?: string;
	/** Value of the `--plugins` option. */
	plugins?: string;
	/** Value of the `--guards` option. */
	guards?: string;
	/** Makes the run not interactive. */
	yes: boolean;
	/** Accepts all conflicts. */
	force: boolean;
	/** Runs the package manager to install Biome and this package. */
	install: boolean;
	/** Plans the changes to the scripts of package.json. */
	scripts: boolean;
	/** Records the changes and writes nothing. */
	dryRun: boolean;
	/** Directory of the target project. */
	cwd: string;
}

/** Holds the package.json fields that the setup reads, and keeps all other fields. */
export type PackageJson = {
	name?: string;
	private?: boolean;
	packageManager?: string;
	workspaces?: unknown;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	scripts?: Record<string, string>;
} & Record<string, unknown>;

/** Writes and moves files, and records the files that it wrote. */
export interface Writer {
	/** Paths that the writer wrote, relative to the project directory. */
	written: string[];
	/** Writes the content to the file. */
	put: (file: string, content: string) => Promise<void>;
	/** Moves the file from one path to another. */
	move: (from: string, to: string) => Promise<void>;
}

/** Collects the results that the setup shows to the user at the end. */
export interface Report {
	/** Messages about the changes that the setup skipped. */
	skipped: string[];
	/** Messages for the user. */
	notes: string[];
	/** Install command of the package manager. It stays empty when the run does not install. */
	install: string;
}

/** Holds the fields that all operations have. */
export interface OperationBase {
	/** Identifier of the operation. */
	id: string;
	/** True when the operation replaces an existing file or script. The operation runs only when the user accepts it. */
	conflict: boolean;
	/** Text that describes the operation in a prompt. */
	label: string;
	/** Message for the report when the user refuses the conflict. */
	skip: string;
	/** Identifier of a conflict operation, or null. When the user refuses that conflict, the installer drops this operation. */
	after: string | null;
	/** Message for the report when the user accepts the operation. */
	note?: string;
}

/** Moves existing config files to backup names. */
export type BackupOp = OperationBase & { kind: "backup"; names: string[] };

/** Writes one file. */
export type WriteOp = OperationBase & {
	kind: "write";
	path: string;
	content: string;
};

/** Adds one script to package.json. */
export type ScriptOp = OperationBase & {
	kind: "script";
	name: string;
	command: string;
};

/** Describes one planned change to the target project. */
export type Operation = BackupOp | WriteOp | ScriptOp;

/** Holds the state that the steps of one setup run share. */
export interface Context {
	/** Absolute path of the target project. */
	cwd: string;
	/** Command line options. */
	opts: Options;
	/** Package manager of the target project. */
	pm: PackageManager;
	/** Writer for the files of the run. */
	writer: Writer;
	/** Gives the ids of the conflicts that the user accepts. */
	decide: (conflicts: Operation[]) => Promise<string[]>;
	/** Results for the final report. */
	report: Report;
	/** Rules, plugins, and guards that the user selected. */
	selected: Selected;
}
