# Biome-Json

A strict Biome config with opt-in rules, Grit plugins, and a suppression guard, plus an installer that adds them to any Node repo (any framework). `catalog.json` lists every option. The shared config is `templates/strict.jsonc`, exported as `biome-json/strict`. Each repo's `biome.jsonc` extends it and holds only that repo's settings, so a rule change ships to every repo with a dependency update. This repo's own `biome.jsonc` extends it and turns on every option.

## Install

Humans (interactive checkboxes):

```sh
bunx github:xsyetopz/biome.jsonc
```

Agents (no prompts; unset lists use the defaults):

```sh
bunx github:xsyetopz/biome.jsonc --yes --rules noConsole,noEnum --plugins noTypeAssertion,useStructuredClone --guards all
```

Without a TTY the installer behaves like `--yes` and prints the selections it used. `--dry-run` prints the planned writes and changes nothing. In a repo that already has a Biome config, add `--force`.

## Flags

| Flag | Meaning |
| --- | --- |
| `--rules <ids\|all\|none>` | Opt-in rules to enable. Default: none. |
| `--plugins <ids\|all\|none>` | Grit plugins to load from the installed package. Default: none. |
| `--guards <ids\|all\|none>` | Guard scripts to copy to `.biome/`. Default: all. |
| `--yes` | No prompts. |
| `--force` | Overwrite without asking (old Biome config moves to `<name>.bak`). |
| `--no-install` | Skip installing `@biomejs/biome` and `biome-json`. |
| `--no-scripts` | Add no scripts to `package.json` (the guard file is still copied). |
| `--dry-run` | Print planned writes, change nothing. |
| `--cwd <dir>` | Target directory. Default: the current directory. |

An unknown id exits 1 and lists the valid ids. Without `--force`, a non-interactive run keeps an existing Biome config and any script whose text differs, and reports what it skipped.

## What the installer decides

- Package manager: the `packageManager` field, then the lockfile, then bun when it is on `PATH` (or runs the installer), else npm. In a workspace root it adds `-w` (pnpm, with `pnpm-workspace.yaml`) or `-W` (yarn classic, with `workspaces`).
- It installs `@biomejs/biome` and `biome-json@github:xsyetopz/biome.jsonc` as dev dependencies. `biome.jsonc` starts from `templates/local.jsonc`: `$schema`, `extends: ["biome-json/strict"]`, then the selected rules, plugins, and `vcs` settings.
- Plugin paths point into `node_modules/biome-json/plugins/`, because Biome resolves plugin paths against the repo, not the extended file. In a workspace member they follow the package to the hoisted `node_modules`.
- The install runs before any file is written. If it fails, the installer exits 1 with one line and changes nothing.
- `$schema` is set to the version that `biome --version` reports, so newer CLIs print no version-mismatch diagnostic.
- Selecting a `nursery.*` rule installs `@biomejs/biome@~x.y.z` instead of `^x.y.z`, because a minor release can promote the rule and break config loading. Run `biome migrate --write` when you upgrade.
- In a git repo, a package below the git top level gets `vcs.root` pointing at the top level, so the root `.gitignore` applies. Outside git, `vcs.enabled` is `false`.
- With `@nestjs/core` or `@angular/core` in `package.json`, `style.useImportType` is `off`: its fix turns constructor-parameter imports into `import type` and breaks dependency injection. `javascript.parser.unsafeParameterDecoratorsEnabled` alone does not stop that diagnostic.
- A config that this installer wrote (a full copy of the template from an older version, or one that already extends `biome-json/strict`) is migrated: the new `biome.jsonc` keeps only the settings and `overrides` that differ from the template. A `.biome/plugins/` copy that still matches its packaged plugin is pointed at the package, and an edited copy stays in use. The report counts template settings that the old copy lacked, which now apply. Configs from anywhere else are replaced.
- A replaced Biome config moves to `<name>.bak`, or `<name>.bak.1`, `<name>.bak.2`, ... when that name is taken.
- A `package.json` that the installer creates gets `name` (the directory name, lowercased and npm-safe) and `"private": true`.

## Why `--error-on-warnings`

Biome has no config key for it, so it is a CLI flag in the scripts. `info` diagnostics never fail a run, which is why the config sets rules to `error`.
