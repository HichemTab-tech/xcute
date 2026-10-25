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

# Only look in the project catalog (skip your personal actions)
xcute run --project lint
```

### `xcute <name> [values...]`

Shortcut for `xcute run`.

```bash
xcute react my-app
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

Inside a repository with an `xcute.yml`, `xcute select` opens with a header, then the catalog's topics, then `Your actions`. Pick a topic to see its entries (with a way back), or just type to search every entry and your own actions at once. Choosing a guide asks `Walk through it` or `Just read it`. In `xcute list`, entries are grouped by topic, then `Other`, then `Your actions`. Guides are marked `(guide, N steps)` and show `N steps` in the commands column with `-c`, and a catalog entry hidden by one of your actions is marked `(your action wins)`.

### `xcute select`

Search, select and run an action. Type to filter by name or description. Inside a repository with an `xcute.yml`, topics come first and guides ask `Walk through it` / `Just read it`.

```bash
xcute select
xcute select react      # start with "react" typed
xcute s react           # same via alias
xcute select -f react   # legacy filter flag
```

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
entries:
  lint:
    description: Lint everything.
    commands:
      - pnpm lint
  preview:
    description: Re-run a preview workflow.
    commands:
      - gh workflow run previews.yml -f pr_number={{pr::Pull request number}}
  greet:
    description: Say hello.
    commands:
      - "{{greeting|hello}} world"   # quote values that start with {{
```

Values that start with `{{` must be quoted, otherwise YAML reads them as a mapping. Variables work as in personal actions.

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
xcute show release                # read it without running anything
xcute release core 1.2.0 --from 3 # start at step 3
xcute release --dry-run           # print every step, run nothing, ask nothing
```

If you stop at step N, xcute prints the exact command that picks up there. A failed command offers `Retry`, `Skip` or `Stop`. Walking a guide asks for trust like any other entry, except with `--dry-run`. `--from` only works with guides.

### Name clashes

Personal actions win. If you have a personal action called `lint` and the catalog has one too, `xcute lint` runs yours. Use `xcute run --project lint` to run the catalog entry. `xcute remove` only touches personal actions and tells you to edit `xcute.yml` for catalog entries.

### Trust

A cloned repository is code someone else wrote, so xcute asks before running anything from a catalog.

- The first time, you see how many entries and commands it has and can choose `Show all commands`, `Trust` or `Cancel`.
- Trust covers what runs: each entry's type and commands. Changing descriptions, topics or other text never asks again. Changing a command asks again, showing only the difference.
- Trust covers the whole file. A changed command in any entry asks before running any entry.
- Without a terminal, xcute refuses and exits with code 1. Run `xcute trust` in the repository to trust the current catalog without a prompt.
- `xcute trust --revoke` removes the trust record.
- Listing, `--dry-run` and other read-only views never ask.

Trust does not cover what your commands call. A trusted `pnpm test` runs whatever the `test` script in `package.json` says, and that file is not checked.

Catalogs are committed to the repository, so never put secrets in them. Use variables and let each person supply the value.

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
