# Biome-Json

A strict Biome config with opt-in rules, Grit plugins, and a suppression guard, plus an installer that adds them to any Node repo (any framework). `catalog.json` lists every option. The shared config is `templates/strict.jsonc`, exported as `biome-json/strict`. Each repo's `biome.jsonc` extends it and holds only that repo's settings, so a rule change ships to every repo with a dependency update. This repo's own `biome.jsonc` extends it and enables every option. The installer runs on bun (>= 1.4.4). The guard runs on bun when bun is on `PATH`, else on node.

## Install

Humans (interactive checkboxes):

```sh
bunx github:xsyetopz/biome.jsonc
```

Agents (no prompts, and unset lists use the defaults):

```sh
bunx github:xsyetopz/biome.jsonc --yes --rules all --plugins all --guards all --force
```

Without a TTY the installer behaves like `--yes` and prints the selections it used. `--dry-run` prints the planned writes and changes nothing. In a repo that already has a Biome config, add `--force`.

## Flags

| Flag | Meaning |
| --- | --- |
| `--rules <ids\|all\|none>` | Opt-in rules to enable. Default: none. |
| `--plugins <ids\|all\|none>` | Grit plugins to load from the installed package. Default: none. |
| `--guards <ids\|all\|none>` | Guard scripts to add to `package.json`. Each runs a bin of the package. Default: all. |
| `--yes` | No prompts. |
| `--force` | Overwrite without asking (old Biome config moves to `<name>.bak`). |
| `--no-install` | Skip installing `@biomejs/biome` and `biome-json`. |
| `--no-scripts` | Add no scripts to `package.json`. |
| `--dry-run` | Print planned writes, change nothing. |
| `--cwd <dir>` | Target directory. Default: the current directory. |

An unknown id exits 1 and lists the valid ids. The installer refuses to run in the biome-json repo itself. Without `--force`, a non-interactive run keeps an existing Biome config and any script whose text differs, and reports what it skipped.

## What the Installer Decides

- Package manager: the installer checks the current directory, then each parent directory. In each directory it reads the `packageManager` field, then a lockfile, then `pnpm-workspace.yaml`. When it finds none, it uses bun. The installer needs bun on `PATH`. The `lint` scripts need bun or node, so a CI job with npm, pnpm, or yarn and no bun still runs the guard. In a workspace root it adds `-w` (pnpm, with `pnpm-workspace.yaml`) or `-W` (yarn classic, with `workspaces`).
- It installs `@biomejs/biome` and `biome-json@github:xsyetopz/biome.jsonc` as dev dependencies. `biome.jsonc` starts from `templates/local.jsonc`: `$schema`, `extends: ["biome-json/strict"]`, then the selected rules, plugins, and `vcs` settings.
- Plugin paths point into `node_modules/biome-json/plugins/`, because Biome resolves plugin paths against the repo, not the extended file. In a workspace member they follow the package to the hoisted `node_modules`.
- Scripts: `lint`, `lint:fix`, `lint:ci`, and the guard scripts. With the suppression guard, `lint` also runs `lint:suppressions`. When the installed `biome ci` rejects `--error-on-warnings`, `lint:ci` omits the flag.
- The install runs before the installer writes any file. If it fails, the installer exits 1 with one line and writes no file. Changes that the package manager made stay.
- When the repo has its own Biome binary, the installer sets `$schema` to the version that `biome --version` reports. Then newer CLIs print no version-mismatch diagnostic.
- Selecting a `nursery.*` rule installs `@biomejs/biome@~x.y.z` instead of `^x.y.z`, because a minor release can promote the rule and break config loading. Run `biome migrate --write` when you upgrade.
- In a git repo, a package below the git top level gets `vcs.root` pointing at the top level, so the root `.gitignore` applies. When `origin/HEAD` exists, `vcs.defaultBranch` gets its branch. Outside git, `vcs.enabled` is `false`.
- With `@nestjs/core` or `@angular/core` in `package.json`, `style.useImportType` is `off`: its fix turns constructor-parameter imports into `import type` and breaks dependency injection. `javascript.parser.unsafeParameterDecoratorsEnabled` alone does not stop that diagnostic.
- The installer migrates a config that it wrote before. That is a full copy of the template from an older version, or a config that already extends `biome-json/strict`. The new `biome.jsonc` keeps only the settings and `overrides` that differ from the template. When a `.biome/plugins/` copy is missing or still matches its packaged plugin, the installer points the config at the package. An edited copy stays in use. The report counts template settings that the old copy lacked, which now apply. The installer replaces any other config, and it keeps a backup.
- The suppression guard runs as the package bin `biome-json-suppressions`, so the installer copies nothing into the repo. The guard is plain JavaScript (`bin/check-suppressions.mjs`), because node does not strip TypeScript types from a file in `node_modules`. The installer replaces a `lint:suppressions` script that an older install wrote (`node .biome/check-suppressions.mjs` or `bun .biome/check-suppressions.mjs`) without `--force`. The old `.biome/check-suppressions.mjs` copy stays, and the report asks you to delete it.
- A replaced Biome config moves to `<name>.bak`, or `<name>.bak.1`, `<name>.bak.2`, ... when that name already exists.
- A `package.json` that the installer creates gets `name` (the directory name, lowercased and npm-safe) and `"private": true`.

## What Each Repo Holds

`biome.jsonc` (the `extends` line, the selected plugins, and the repo's own settings), the dev dependencies `@biomejs/biome` and `biome-json`, and the scripts. The repo needs no copied plugins and no guard file. A global install cannot replace these, as of Biome 2.6.3:

- Biome reads no per-user config, so a repo without `biome.jsonc` gets the defaults.
- `extends: ["biome-json/strict"]` resolves only from the repo's `node_modules`, not from a global install.
- A shared config through `BIOME_CONFIG_PATH` treats the config's own folder as the VCS root, so `.gitignore` stops working.
- Absolute paths in `extends` and `plugins` work only on one machine.

With `bun add -g github:xsyetopz/biome.jsonc`, the commands `biome-json` (the installer) and `biome-json-suppressions` (the guard, which takes an optional root directory) work in any repo without a dependency.

## Why `--error-on-warnings`

Biome has no config key for it, so it is a CLI flag in the scripts. `info` diagnostics never fail a run, which is why the config sets rules to `error`.
