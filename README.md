# xcute

A CLI to save, reuse, and execute command actions.

> _Previously known as **project-registry**_

[![Version](https://img.shields.io/npm/v/xcute-cli.svg)](https://npmjs.org/package/xcute-cli)
[![Downloads/week](https://img.shields.io/npm/dw/xcute-cli.svg)](https://npmjs.org/package/xcute-cli)
[![License](https://img.shields.io/npm/l/xcute-cli.svg)](https://github.com/HichemTab-tech/xcute-cli/blob/master/LICENSE)


![xcute banner](assets/banner.png)

## Installation

**Requirements:**
- Node.js version **21.0.0** or higher.

```bash
npm install -g xcute-cli
```

or

```bash
pnpm add -g xcute-cli
```


## Quick Start

### 1. Add a simple action

An action is just **a name mapped to one or more commands**.

```bash
xcute add react "pnpm create vite . --action react"
```

### 2. Run it

```bash
xcute react
```

That’s it ^.^


## Using variables

Actions can contain variables using the `{{variable}}` syntax.

Example:

```bash
xcute add react \
  "pnpm create vite {{name}} --action react" \
  "cd {{name}}" \
  "pnpm install"
```

### Variables with description

You can provide a description for a variable to make the prompt more helpful using `{{variable::description}}` syntax:

```bash
xcute add my-action "echo {{name::Enter the project name}}"
```

If you use the same variable multiple times, you only need to add the description once:

```bash
xcute add my-action \
  "echo Creating {{name::Project Name}}" \
  "mkdir {{name}}" \
  "cd {{name}}"
```

### Variables with default values

You can provide a default value using `{{variable|default}}` syntax:

```bash
xcute add my-action "code {{path|.}}"
```

You can combine description and default value with `{{variable::description|default}}`:

```bash
xcute add my-action "echo {{name::Project Name|my-app}}"
```

Resolution order is:

1. Passed CLI value
2. Variable default value
3. Interactive prompt

Run it by passing values:

```bash
xcute react my-app
```

If a value is missing, `xcute` will **ask for it automatically**.

Variables are optional — if you don’t need them, don’t use them.

## Running actions (name or select)

### Run directly by name

```bash
xcute react my-app
```

This is the fastest way if you remember the name.

### Use interactive selection (recommended)

If you don’t remember the exact name:

```bash
xcute select # or xcute s
```

You’ll get a list you can filter by typing, then pick one with Enter. Typing matches names and descriptions.

#### Filtering actions

You can filter the list when you have many actions:

```bash
xcute select rea
xcute s rea
xcute select -f rea # still supported
```

Example:

* `react`
* `react-ts`
* `react-shadcn`

This makes `select` the **default workflow** for many users.

## Tip: shorten `xcute` to `x`

If you use `xcute` a lot, adding a shell alias can make common flows faster.

Example:

```bash
x add react "pnpm create vite . --action react"
x react
x select
```

### Linux / macOS

For `bash` or `zsh`, add this to your shell config:

```bash
alias x='xcute'
```

Common locations:

- `~/.bashrc`
- `~/.zshrc`

After saving, reload your shell:

```bash
source ~/.bashrc
# or
source ~/.zshrc
```

### Windows

For PowerShell, add this function to your PowerShell profile:

```powershell
function x { xcute $args }
```

If your profile does not exist yet, create it first:

```powershell
New-Item -ItemType File -Path $PROFILE -Force
```

Then open it:

```powershell
notepad $PROFILE
```

Save the function, then reload your profile:

```powershell
. $PROFILE
```

This gives you a short `x` command in every new PowerShell session.

For Command Prompt (`cmd.exe`), you can create a shortcut for the current session with:

```bat
doskey x=xcute $*
```


## Commands

### `xcute add <name> <commands...>`

Register a new action with one or more commands.

```bash
# Basic usage
xcute add <name> "command1" "command2" "command3"

# With description
xcute add <name> -d "My action description" "command1" "command2"

# Interactive mode
xcute add
```

Variables use `{{variable}}` syntax and are resolved at run time.

### `xcute run <name> [values...]`

Run a registered action.

On Unix-like systems, actions are executed through your current shell from `$SHELL` in interactive mode when available, so aliases and shell functions from your normal CLI are available there too.

```bash
# Pass variable values as arguments
xcute run react my-app

# Force interactive mode
xcute run react -i

# Print the resolved commands without running them
xcute run react my-app --dry-run

# Only look in the project catalog (skip your personal actions)
xcute run --project lint

# Start a guide at step 3
xcute run release core 1.2.0 --from 3
```

### `xcute <name> [values...]`

Shortcut for `xcute run`. It takes the same flags, anywhere after the name; everything else is a value.

```bash
xcute react my-app
xcute react -i                      # -i, --interactive: ask for every value
xcute react my-app -d               # -d, --dry-run: print the commands, run nothing
xcute lint --project                # --project: skip your own actions, use the project catalog
xcute release core 1.2.0 --from 3   # --from <n>: start a guide at step n
```

### `xcute list`

List all registered actions.

```bash
# Table format (default)
xcute list
xcute list -c        # show commands
xcute list --no-table
xcute list -f "preview fail"   # match words in names and descriptions
```

Inside a repository with an `xcute.yml`, catalog entries are grouped by topic, then `Other` (entries without a topic), then `Your actions`. Guides are marked `(guide, N steps)` and show `N steps` in the commands column with `-c`, and a catalog entry hidden by one of your actions is marked `(your action wins)`.

### `xcute select`

Search, select and run an action. Type to filter by name or description.

```bash
xcute select
xcute select react      # start with "react" typed
xcute s react           # same via alias
xcute select -f react   # legacy filter flag
```

Inside a repository with an `xcute.yml`, the picker opens with a header (`<name> · N entries in M topics · K of your actions`), then the catalog's topics with their summaries, then `Your actions`. Pick a topic to see its entries (with a way back), or just type to search every entry and your own actions at once; results are labelled `Topic › name`. Choosing a guide asks `Walk through it` or `Just read it`.

### `xcute show <name> [values...]`, `xcute trust` and `xcute check`

`show` prints an action or catalog entry without running it or asking anything. `trust` and `check` work on the project catalog (see [Project catalogs](#project-catalogs)). They are built-in command names, so an action called `show`, `trust` or `check` can only be run with `xcute run <name>`.

### `xcute remove <name>`

Remove a action.

```bash
xcute remove react
xcute remove -s      # interactive selection
xcute remove -y      # skip confirmation
```

### `xcute export <path>`

Export your action registry to a JSON file (backup).

```bash
# Export to a file
xcute export backup.json

# Export to a directory (creates xcute.json)
xcute export ./backups/
```

### `xcute import <path>|<url>`

Import action from a JSON file or URL.

```bash
# Import from local file (merges with existing)
xcute import backup.json

# Import from URL
xcute import https://example.com/shared-actions.json

# Import from file and replace ALL existing actions
xcute import backup.json --replace
```

### Sync with a private Git repo

If you want the same registry on multiple machines, use a dedicated **private Git repository**.

`xcute` keeps a managed clone locally and syncs the exported registry file through Git.

This is safer and easier to reason about than using gists, especially when actions may contain private commands.

Avoid storing secrets directly in synced commands whenever possible.

### `xcute sync-init <repo-url>`

Initialize sync by cloning a Git repository used to store your registry snapshot.

```bash
# Use a private repository
xcute sync-init git@github.com:you/xcute-sync.git

# Store the registry in a custom path inside the repo
xcute sync-init git@github.com:you/xcute-sync.git --file data/xcute.json
```

### `xcute sync-pull`

Pull the remote registry snapshot and merge it into your local registry.

Conflicts are resolved per action name using one of these strategies:

- `prompt` asks you which version should win
- `local` keeps your local version
- `remote` uses the remote version

```bash
# Interactive conflict resolution (default)
xcute sync-pull

# Always prefer remote changes on conflicts
xcute sync-pull --strategy remote
```

### `xcute sync-push`

Merge local and remote changes, write the merged snapshot into the sync repo, then push it upstream.

```bash
# Interactive conflict resolution (default)
xcute sync-push

# Always prefer local changes on conflicts
xcute sync-push --strategy local
```

### `xcute sync-status`

Show the configured sync repo, tracked registry file, local drift since the last sync point, remote drift since the last sync point, and Git status for the managed clone.

```bash
xcute sync-status
```

### `xcute self-update [package-manager]`

Update the CLI to the latest version.

```bash
# Update using pnpm (default)
xcute self-update

# Update using npm
xcute self-update npm

# Update using yarn
xcute self-update yarn
```

## Project catalogs

A project can ship its own commands in an `xcute.yml` file at the root of the repository, so everyone who clones it runs the same things by the same names.

### Where xcute looks

xcute starts in the current directory and walks up, using the first `xcute.yml` it finds. It stops after the repository root (the first directory containing `.git`), so a catalog above the repository never applies. Outside a Git repository only the current directory is checked.

### Example

```yaml
version: 1
name: My App
topics:
  checks:
    title: Checks
    summary: lint and test
entries:
  lint:
    topic: checks
    description: Lint everything.
    commands:
      - pnpm lint
  test:
    topic: checks
    description: Run the tests with the package manager of your choice.
    commands:
      - "{{pm::Package manager|pnpm}} test"   # quote values that start with {{
  preview:
    description: A preview workflow failed and needs a fresh run.
    docs: CONTRIBUTING.md#previews
    commands:
      - gh workflow run previews.yml -f pr_number={{pr::Pull request number}}
```

Variables work as in personal actions. Values that start with `{{` must be quoted, otherwise YAML reads them as a mapping.

### `xcute.yml` reference

Top level:

- `version` (optional): `1`. Any other value is refused.
- `name` (optional): shown in headers. Defaults to the name of the folder that contains `xcute.yml`.
- `topics` (optional): a mapping of topic ids to topics, shown in file order. Each topic has a `title` (required) and a `summary` (optional).
- `entries` (required): a mapping of entry names to entries, with at least one entry. Names may contain `:` (`release:plan`). `__proto__` is reserved.

Each entry has:

- `description` (required): one sentence, ideally phrased as when you would need it.
- `topic` (optional): a key under `topics`. Entries without a topic are listed under `Other`.
- `docs` (optional): a path or URL, printed with the entry. xcute never opens it.
- exactly one of `commands` (a list of commands, a command entry) or `steps` (a list of steps, a [guide](#guides)).

Each step of a guide has a `title` (required), an optional `text` and `warn`, and exactly one of:

- `run`: one command, or a list of commands;
- `manual`: what to do by hand;
- `check`: what to look at and confirm.

Rules:

- Unknown keys anywhere are errors, so a typo such as `comands:` is caught at once.
- Each command (a `commands` item or a `run` item) must be one line. The commands of an entry or a step are joined with ` && ` and run in one shell, so write one list item per command rather than a `|` block.
- `text`, `warn`, `manual` and `check` may span several lines.
- Control characters such as terminal escape sequences or carriage returns are refused everywhere, so what xcute prints is what runs. Tabs and line breaks are fine, except that a command must be one line.
- A value that starts with `{{` must be quoted (`- "{{pm|pnpm}} test"`). Unquoted, YAML reads it as a mapping, and the error says so.
- Errors give the file and line. A catalog with errors cannot be run: `xcute list` and `xcute select` print its errors and still show your own actions, and `xcute check` lists every error at once.

### Running entries

```bash
xcute lint
xcute run lint
xcute run --project lint
```

Catalog commands always run from the directory that contains `xcute.yml`, wherever you invoked xcute. Personal actions keep running from your current directory.

### Guides

An entry with `steps:` instead of `commands:` is a guide: a checklist you walk through one step at a time. Each step has a `title` and exactly one of three kinds, plus optional `text` and `warn` lines.

- `run` runs one or more commands, after you choose `Run`, `Skip` or `Stop`.
- `manual` is something you do by hand. You confirm with `Done, continue`.
- `check` is something to look at. You confirm with `Looks right, continue`.

```yaml
entries:
  release:
    description: Cut a release.
    steps:
      - title: Run the tests
        run: pnpm test
      - title: Bump {{component::Component}} to {{version::Version}}
        run:
          - pnpm version {{version}}
        warn: This creates a commit and a tag.
      - title: Merge the release pull request
        manual: Merge it on GitHub once CI is green.
      - title: Check the published package
        check: "{{component}} {{version}} shows up on the registry."
```

Values are asked when a step first needs them, unless you passed them on the command line (`xcute release core 1.2.0`). Values given as arguments fill the guide's variables in the order they first appear.

```bash
xcute release core 1.2.0          # walk through the guide
xcute show release core 1.2.0     # read it: runs nothing and asks nothing
xcute release core 1.2.0 --from 3 # start at step 3
xcute release --dry-run           # walk it, printing each command instead of running it
```

`xcute show` fills each variable with the value you passed, else its default, else a `<name>` placeholder, and ends with the command that resumes the guide. `--dry-run` walks the steps without running anything or stopping at them, but still asks for values that have no default and were not passed.

If you stop at step N, xcute prints the exact command that picks up there, with the values you gave. A failed command offers `Retry`, `Skip` or `Stop`. Walking a guide asks for trust like any other entry, except with `--dry-run`. `--from` only works with guides.

### Name clashes

Personal actions win. If you have a personal action called `lint` and the catalog has one too, `xcute lint` runs yours. Use `xcute run --project lint` to run the catalog entry. `xcute remove` only touches personal actions and tells you to edit `xcute.yml` for catalog entries.

### Trust

A cloned repository is code someone else wrote, so xcute asks before running anything from a catalog.

- The first time, you see how many entries and commands it has and can choose `Show all commands`, `Trust` or `Cancel`.
- Trust covers what runs: each entry's type and commands. Changing descriptions, topics or other text never asks again. Changing a command asks again, showing only the difference.
- Trust covers the whole file. A changed command in any entry asks before running any entry.
- Without a terminal, xcute refuses and exits with code 1. Run `xcute trust` in the repository to trust the current catalog without a prompt.
- `xcute trust --revoke` removes the trust record.
- Listing, searching in `xcute select`, `xcute show`, `--dry-run` and `xcute check` never ask.
- Trust records are kept in `trust.json` in the xcute folder (see [Config location](#config-location)), keyed by the real path of `xcute.yml`. A moved repository or a second clone needs its own trust.

Trust does not cover what your commands call. A trusted `pnpm test` runs whatever the `test` script in `package.json` says, and that file is not checked.

Catalogs are committed to the repository, so never put secrets in them. Use variables and let each person supply the value.

### Checking a catalog

`xcute check` validates the `xcute.yml` found from the current directory and compares it with the `package.json` next to it. It runs nothing and needs no trust.

- Validation errors are printed with their line numbers, or `<file>: OK (N entries)`.
- `Missing scripts:` lists entries whose commands call a `package.json` script that does not exist. This is a heuristic over `pnpm`, `npm`, `yarn` and `bun` command forms (`pnpm lint`, `pnpm run lint`, `npm run lint`, `yarn lint`, `bun run lint`). Package manager built-ins, names found in `node_modules/.bin`, and commands using `--filter`, `-r`, `-C` and similar flags are skipped.
- `Scripts no entry mentions (N):` lists root scripts that no entry or guide step calls. This list appears only in `xcute check`.

It exits with code 1 when there are validation errors or missing scripts, and 0 otherwise. Uncovered scripts never fail it.

## Examples

### Project templates

```bash
# React + Vite
xcute add react \
  "pnpm create vite {{name}} --action react-ts" \
  "cd {{name}}" \
  "pnpm install" \
  "code ."

# Next.js
xcute add next "pnpm create next-app {{name}}" "cd {{name}}" "code ."

# Express API
xcute add express "mkdir {{name}}" "cd {{name}}" "pnpm init -y" "pnpm add express" "code ."
```

### Dev shortcuts

```bash
# Git quick commit
xcute add gc "git add ." "git commit -m '{{message}}'" "git push"

# Docker compose
xcute add dcu "docker compose up -d"
xcute add dcd "docker compose down"

# SSH to server
xcute add ssh-prod "ssh {{user}}@production-server.com"
```

## Config location

Actions are stored at:

```
~/.xcute/config.json
```

Set `XCUTE_HOME` to move the folder. Everything moves with it: `config.json`, `sync.json`, the sync clone and `trust.json`. After moving an existing folder, re-run `xcute sync-init`, because `sync.json` stores the clone's absolute path.

---

## 🤝 Contributions

Contributions are welcome! Please follow the standard fork-and-pull-request workflow.

## Issues

If you encounter any issue, please open an issue [here](https://github.com/HichemTab-tech/xcute/issues).

## License

Distributed under the MIT License. See [`LICENSE`](LICENSE) file for more details.

&copy; 2026 [Hichem Taboukouyout](mailto:hichem.taboukouyout@hichemtab-tech.me)

---

_If you found this package helpful, consider leaving a star! ⭐️_
