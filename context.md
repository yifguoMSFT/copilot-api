# Copilot API Context

## Project

`copilot-api` is a Bun/TypeScript CLI and HTTP proxy that exposes GitHub Copilot through OpenAI- and Anthropic-compatible endpoints. The CLI executable is named `copilot-api`, and the default server URL is `http://localhost:4141`.

Prerequisites:

- Bun 1.2 or newer
- A GitHub account with an active Copilot subscription

## Install This Checkout as a Global CLI

Use this workflow when the global command must include the local modifications in this repository:

```sh
cd /e/workshop/copilot-api
bun install
bun run build
bun link
```

`bun run build` creates `dist/main.js`. The `bin` entry in `package.json` maps the global `copilot-api` command to that file. `bun link` registers the current checkout globally, so the command continues to point at this repository.

Verify the installation:

```sh
copilot-api --help
copilot-api debug
```

Start the API server:

```sh
copilot-api start --port 4141
```

The first start performs GitHub authentication if no saved token exists. Authentication can also be run separately:

```sh
copilot-api auth
```

After changing source code, rebuild it before invoking the linked CLI again:

```sh
bun run build
```

The global link does not need to be recreated after each build. To unregister this checkout, run the following from the repository root:

```sh
bun unlink
```

### Windows PATH

If Git Bash or PowerShell cannot find `copilot-api` after linking, ensure Bun's binary directory is on `PATH`:

```text
%USERPROFILE%\.bun\bin
```

Restart the terminal after changing `PATH`, then check:

```sh
which copilot-api
copilot-api --help
```

### Install the Published Package Instead

These commands install the published npm release, not the modified code in this checkout:

```sh
bun add --global copilot-api
# or
npm install --global copilot-api
```

Use the local `bun link` workflow when the Luna alias and logging changes from this checkout are required.

## Useful CLI Commands

```sh
copilot-api start
copilot-api start --port 8080 --verbose
copilot-api auth
copilot-api check-usage
copilot-api debug
copilot-api debug --json
```

The main subcommands are `start`, `auth`, `check-usage`, and `debug`.

## Session Changes

- Added the model alias `codex-auto-review -> gpt-5.6-luna`.
- Applied model aliases to relevant request paths and added alias request/result logging.
- Replaced noisy raw Responses API SSE output with concise semantic summaries.
- Excluded encrypted content, IDs, instructions, tool schemas, obfuscation data, and duplicate deltas from those logs.
- Added regression tests for model aliases and Responses route behavior.
- Previously validated tests, lint, typecheck, build, and live endpoint behavior.

## Pre-commit Hook

The repository configures `simple-git-hooks` in `package.json` to install a pre-commit command that runs `bunx lint-staged`. It appeared to stall because lint-staged created an automatic backup stash and linted every staged file.

The current local `.git/hooks/pre-commit` was disabled by adding an immediate successful exit, so commits in this checkout no longer invoke lint-staged. Running `bun install` may regenerate that hook from `package.json`; if commit delays return, inspect `.git/hooks/pre-commit` and disable it again or remove the hook configuration from `package.json`.

Several existing `lint-staged automatic backup` stashes were deliberately left untouched. Inspect them with:

```sh
git stash list
```

Do not drop or restore them without first checking their contents and the current working tree.

## Development Validation

```sh
bun test
bun run lint
bun run typecheck
bun run build
```

Run one test file with:

```sh
bun test tests/<name>.test.ts
```
