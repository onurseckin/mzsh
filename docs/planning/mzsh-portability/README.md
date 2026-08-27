# MZSH portability guide

## Managed entrypoints

Adoption creates stable loaders for `.zshenv`, `.zprofile`, and `.zshrc`. The
all-shell loader records portable context only; the login loader applies the
path-only login manifest; the interactive loader starts the full manifest only
for interactive Zsh. They source the managed `current` tree, not a lexical glob
of a user's existing files.

The default menu follows the same boundary: managed loaders first, then the
owner-only private file, then public portable modules. Existing files in the
legacy configuration directory remain selectable only as **Legacy migration
context**. They are not automatically sourced or copied.

## Checkout-local workflow

Use the repository entrypoint rather than assuming a global installation:

```sh
git clone <reviewed-mzsh-repository-url> mzsh
cd mzsh
bun install
bun run mzsh -- audit
bun run mzsh -- bootstrap --source "$PWD"
bun run mzsh -- bootstrap --source "$PWD" --apply
```

The first bootstrap is a dry run. Keep using `bun run mzsh -- update` and
`bun run mzsh -- rollback` from the checkout for routine change and recovery.

## Private state and recovery

The default private target is `${XDG_CONFIG_HOME:-$HOME/.config}/mzsh/private.zsh`.
It must be a regular, readable, non-symlink file owned by the current user with
no group or other permissions. MZSH copies only classifier-selected plain
assignments from an explicit legacy source during adoption; it never evaluates
or logs source text.

Each apply records a receipt and owner-only backups under managed state. Use a
dry rollback first, then `--apply` only for the intended receipt. Repository
metadata is planning provenance; rollback relies on protected receipt backups,
so it remains possible after a checkout is removed.

## Path and runtime policy

The path builder validates directories and removes duplicates without changing
first precedence:

1. Managed safety shims
2. Existing NVM-selected runtime (`NVM_BIN`)
3. Injected application roots, including Homebrew and MacPorts
4. The inherited PATH

MZSH loads `nvm.sh` only when it already exists. It never downloads NVM, Node,
or an LTS release, and it does not call NVM to select one. If the operator's
existing NVM configuration has activated an LTS runtime, that runtime is the
interactive Node choice; Homebrew Node stays available as a dependency/fallback
path. Use `bun run mzsh -- audit` to investigate Node, Vercel, or pnpm shadowing before
applying a plan.

## Completion and FZF

Completion directories are registered before optional Oh My Zsh loading. The
framework owns `compinit` when present; otherwise MZSH initializes it exactly
once with an owner-only cache. Inspect `MZSH_COMPLETION_OWNER` when diagnosing
completion behavior.

FZF is optional and never bootstrapped by MZSH. Set `MZSH_FZF_SHELL_DIR` only
to a trusted local directory containing static `key-bindings.zsh` and
`completion.zsh` files. MZSH sources only readable regular files from that
non-symlink directory; it does not run `fzf --zsh`, evaluate generated output,
or contact the network at startup.

## Dependency caveats

| Dependency or capability             | Status        | MZSH boundary                                                                         |
| ------------------------------------ | ------------- | ------------------------------------------------------------------------------------- |
| Zsh completions                      | Actionable    | Configure existing completion directories and verify the one recorded owner.          |
| PostgreSQL                           | Informational | Database URL helpers redact output; server installation is external.                  |
| Java 17                              | Actionable    | Audit finds registered Java; install/select a local JDK outside MZSH.                 |
| `ffmpeg-full` and `imagemagick-full` | Informational | Media tooling is never installed or assumed.                                          |
| tree-sitter CLI                      | Informational | Parser tooling belongs to the consuming project.                                      |
| Node, Vercel, pnpm                   | Actionable    | Resolve path ownership and ensure pnpm's global executable directory is discoverable. |
| NVM                                  | Actionable    | Existing selected runtime is preferred; installation/version selection is external.   |
| `htop` and `tmux`                    | Informational | MZSH does not install or start either tool.                                           |
| fzf                                  | Actionable    | Opt in only to trusted static shell files.                                            |
| ngrok                                | Informational | Tunnels, credentials, and authentication remain external.                             |

For the end-to-end new-machine, update, and recovery commands, see the
[repository README](../../../README.md). The rationale is in
[ADR-001](../../decisions/001-managed-dotfiles.md).
