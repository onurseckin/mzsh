# mzsh

MZSH is a managed, reversible Zsh configuration foundation. It audits a local
machine, plans an adoption without changing it by default, and records receipts
and protected backups for rollback. It does not install runtimes, fetch updates,
or copy private values into the repository.

## New Mac workflow

1. Clone a reviewed checkout and enter it:

   ```sh
   git clone <reviewed-mzsh-repository-url> mzsh
   cd mzsh
   ```

2. Install this checkout's dependencies:

   ```sh
   bun install
   ```

3. Inspect the machine before changing it:

   ```sh
   bun run mzsh -- audit
   ```

4. Produce an adoption plan from an absolute local checkout. This is a dry run:

   ```sh
   bun run mzsh -- bootstrap --source "$PWD"
   ```

5. Review the target states, module order, repository hashes, and any sensitive
   assignment count. Apply only an accepted plan:

   ```sh
   bun run mzsh -- bootstrap --source "$PWD" --apply
   ```

The applied receipt lives below the managed configuration state directory. It
identifies the transaction needed for rollback; do not delete its backups until
the transaction is unavailable.

## Daily workflow

`bun run mzsh --` without a managed command opens a managed-first menu. Stable loaders,
the private boundary, and portable modules appear before explicitly labeled
legacy migration context. Terminal editors receive the selected path as one
argument; GUI launchers detach without shell command parsing.

```sh
# Read-only report, suitable before every migration or recovery decision.
bun run mzsh -- audit

# After you update your local checkout through your normal source-control flow,
# plan its local adoption. MZSH does not fetch or pull for you.
bun run mzsh -- update --source "$PWD"
bun run mzsh -- update --source "$PWD" --apply

# Inspect then restore the recorded transaction.
bun run mzsh -- rollback receipt-id
bun run mzsh -- rollback receipt-id --apply
```

Retired `--update`, `--reinstall`, and `--uninst` routes return a fixed migration
response. Do not use global unlink/reinstall or manually delete managed loader
files as a recovery mechanism.

## Managed topology

Bootstrap owns three quiet stable loaders in the home directory, a local
private file under the XDG config root, a `current` link to the portable Zsh
tree, and the safety-shim link. The stable loaders are the only profile entry
points; `manifest.zsh` has the canonical interactive order and private loading
is last. The private file must be a current-user-owned, non-symlink regular file
without group or world permissions. It is never serialized into plans, receipts,
diagnostics, or this repository.

See [the portability guide](docs/planning/mzsh-portability/README.md) for loader
contexts, completion ownership, fzf integration, and runtime-path policy. The
decision record is [ADR 001](docs/decisions/001-managed-dotfiles.md).

## Runtime and path policy

Safety shims are first. In an interactive shell, an already active NVM runtime
is next, then injected application roots such as Homebrew. MZSH never installs
Node or calls NVM to choose a version: if your existing NVM setup activates an
LTS runtime, its `NVM_BIN` wins over Homebrew's Node. Homebrew's Node remains a
dependency/fallback tool rather than the interactive version manager. Audit any
Node, Vercel, or pnpm path shadow before applying a plan.

## Tool caveats

| Area                         | Status        | What MZSH does                                                                                | Operator action                                                                                       |
| ---------------------------- | ------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Zsh completions              | Actionable    | Registers configured Homebrew/Docker directories before the one completion owner initializes. | Set only existing completion directories; inspect `MZSH_COMPLETION_OWNER` if completions are missing. |
| PostgreSQL                   | Informational | Provides redacted database URL helpers only.                                                  | Install/configure PostgreSQL outside MZSH when a project needs it.                                    |
| Java 17                      | Actionable    | Audits Java discovery; it does not install a JDK.                                             | Register/select a supported local JDK, then rerun `bun run mzsh -- audit`.                            |
| `ffmpeg-full`                | Informational | Does not install multimedia tooling.                                                          | Install it through your chosen package manager only when a project requires it.                       |
| tree-sitter CLI              | Informational | Does not install parsers or grammars.                                                         | Install the CLI in the project/toolchain that needs it.                                               |
| Node, Vercel, pnpm shadowing | Actionable    | Reports ownership/path conflicts and preserves explicit precedence.                           | Choose one interactive Node owner, verify pnpm's executable bin is on PATH, and rerun audit.          |
| NVM                          | Actionable    | Sources an existing `nvm.sh`; never installs or selects a release.                            | Configure your preferred existing NVM/LTS policy outside MZSH.                                        |
| `htop`                       | Informational | No installation or startup action.                                                            | Install it independently if desired.                                                                  |
| `tmux`                       | Informational | Does not create sessions or alter tmux configuration.                                         | Configure tmux independently.                                                                         |
| `imagemagick-full`           | Informational | No installation or path assumption.                                                           | Install it only for workflows that require it.                                                        |
| fzf                          | Actionable    | Can source two opt-in, static local shell files; it never evaluates `fzf --zsh` output.       | Set `MZSH_FZF_SHELL_DIR` only to a trusted local FZF shell directory.                                 |
| ngrok                        | Informational | No installation, authentication, or tunnel startup.                                           | Configure ngrok outside MZSH when required.                                                           |

## Development

```sh
mise exec -- bun run quality:check
bun run build:ts
bun test
```

The quality gate uses Oxlint, Oxfmt, native Zsh syntax checks, pinned shfmt and
ShellCheck through mise, and a 400-line limit for first-party TypeScript roots.
