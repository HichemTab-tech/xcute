# Contributing Guide

Thanks for wanting to contribute 🙌
This project is intentionally simple, and the contribution process reflects that.

## Before contributing

* Check existing issues first:
  [https://github.com/HichemTab-tech/xcute/issues](https://github.com/HichemTab-tech/xcute/issues)
* If your idea or bug isn’t listed, open a new issue and explain it briefly.
* If you’re unsure, opening an issue **before coding** is totally fine.

## Code of conduct (short version)
* Be respectful.
* Be constructive.
* No toxic behavior.

That’s it.

Long version here: [https://github.com/HichemTab-tech/xcute/blob/master/CODE_OF_CONDUCT.md](https://github.com/HichemTab-tech/xcute/blob/main/CODE_OF_CONDUCT.md)

## Tech stack (important)

This CLI is built using **oclif**.

* Each CLI command lives in its own file under `src/commands`
* Adding a new command usually means adding a new file
* Flags, arguments, and help output are handled by oclif

If you’re not familiar with it, check the official docs:
👉 [https://oclif.io/docs/introduction](https://oclif.io/docs/introduction)

You **don’t need deep oclif knowledge** to contribute — most changes are straightforward.

## Local setup

1. Fork the repository on GitHub.
2. Clone your fork:

    ```bash
    git clone https://github.com/YOUR_USERNAME/xcute
    cd xcute
    ```

3. Install dependencies:

```bash
npm install
# or
pnpm install
```

## Making changes

1. Create a branch from `master`:

    ```bash
    git checkout -b feature/my-feature
    # or
    git checkout -b fix/my-bug
    ```

2. Make your changes.

3. If you’re adding a CLI command:

    * Add a new file under `src/commands`
    * Follow existing commands as examples

4. Make sure the CLI still works as expected.

    You can test commands using:
    ```bash
    .\bin\run testCommand
    ```

5. Commit with a clear message:

```bash
git commit -m "feat: add filter option to select command"
```

6. If your change affects users of the CLI, add a changeset:

    ```bash
    pnpm changeset
    ```

    Pick the bump type (`patch`, `minor` or `major`), write one line for the changelog, and commit the generated file in `.changeset/`. Internal changes (tests, CI, refactors) don't need one.

## Submitting a pull request

1. Push your branch:

    ```bash
    git push origin feature/my-feature
    ```

2. Open a Pull Request on GitHub.
3. In the PR description, explain:

    * What you changed
    * Why it’s useful
    * Any related issue (`Closes #123` if applicable)

## Releases (maintainers)

1. When changesets land on `master`, the **Version Packages** workflow opens or updates a `chore: version packages` pull request. It bumps the version in `package.json` and updates `CHANGELOG.md`.
2. Merge that pull request when you want to release.
3. Publish a GitHub release for the new version (for example `v0.12.0`). The **Publish** workflow then publishes the package to npm.

## Notes

* Small, focused PRs are preferred.
* Avoid refactoring unrelated code.
* Keep changes aligned with the project philosophy:
  **simple, predictable, no magic**.

Thanks for contributing ❤️
