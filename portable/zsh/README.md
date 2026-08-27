# Portable Zsh foundation

`portable/zsh` is MZSH's non-secret shell foundation. It is safe to keep in a
repository because it contains only module logic and configuration contracts;
private exports remain outside this tree.

## Entrypoints and ownership

The `loaders/` directory contains syntax-valid loaders for the three shell
contexts. They never source a machine's existing Zsh files, run installers, or
contact the network.

- `loaders/zshenv.zsh` marks the all-shell context and only records the portable
  root. Keep prompts, plugins, completion, and credentials out of this context.
- `loaders/zprofile.zsh` marks the login context and loads only the login
  manifest's deterministic path policy. It never loads plugins, completion,
  prompts, aliases, or private values.
- `loaders/zshrc.zsh` marks the interactive context and sources `init.zsh` only
  for an interactive Zsh session.

`init.zsh` is same-shell idempotent. It snapshots PATH, fpath, and every MZSH
definition that can replace an existing user function, alias, hook, variable,
or Oh My Zsh style. If a module fails, it restores that state before clearing
the sentinel, allowing a corrected retry. A successful load publishes
`MZSH_PORTABLE_ZSH_VERSION=1` and the ordered `MZSH_LOADED_MODULES` array.

## Manifest and module order

`manifest.zsh` is the only interactive module loader; it does not use glob
order. Its successful module trace is: `observability`, `path`,
`safety-shims`, `macports`, `homebrew`, `bun`, `nvm`, `rust`, `android`,
`runtime-paths`, `completion-directories`, `oh-my-zsh`, `completion`,
`prompt-vi`, `aliases`, `search`, `history`, `dburl`, `ports-manager`, and
`private`. PATH finalizes exactly once after `completion-directories`, before
the framework. The private module is last.

`login-manifest.zsh` deliberately uses the strict subset `observability`,
`path`, `safety-shims`, `macports`, `homebrew`, `bun`, `rust`, `android`, and
`runtime-paths`. A later interactive load preserves its shim-first,
deduplicated PATH and adds no login-only duplicate state.

The path module places `MZSH_COMMAND_SHIM_DIR` ahead of application and
inherited PATH entries, ignores missing application directories, and
canonicalizes equivalent existing absolute directory variants while preserving
their first precedence. Application roots are supplied explicitly; no
architecture-specific Homebrew default is assumed.

## Variables and tool policy

| Variable                            | Purpose                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `MZSH_COMMAND_SHIM_DIR`             | Existing command-safety shim directory, registered first.                                   |
| `MZSH_HOMEBREW_PREFIX`              | Homebrew prefix used for `bin`, `sbin`, completions, and existing stable runtime opt links. |
| `HOMEBREW_PREFIX`                   | Standard Homebrew export used when no MZSH-specific prefix is configured.                   |
| `MZSH_MACPORTS_PREFIX`              | Optional MacPorts prefix used for `bin` and `sbin`.                                         |
| `BUN_INSTALL`                       | Bun installation root.                                                                      |
| `NVM_DIR`                           | Existing NVM installation root.                                                             |
| `CARGO_HOME`                        | Rust/Cargo root; defaults to the conventional home-relative location.                       |
| `ANDROID_HOME` / `ANDROID_SDK_ROOT` | Android SDK root; `ANDROID_HOME` wins when both are set.                                    |
| `MZSH_OH_MY_ZSH_ROOT`               | Optional Oh My Zsh root; defaults to `$HOME/.oh-my-zsh`.                                    |
| `MZSH_DOCKER_COMPLETION_DIR`        | Existing Docker completion directory to register before completion initialization.          |
| `MZSH_FZF_SHELL_DIR`                | Trusted local directory containing static FZF key bindings and completion files.            |
| `MZSH_PRIVATE_ZSH`                  | Optional local private-file override.                                                       |
| `MZSH_OBSERVE=1`                    | Enables redacted diagnostics on stderr.                                                     |

NVM has the auditable policy `MZSH_NVM_POLICY=existing-installation-only`.
Startup sources `nvm.sh` only when that file already exists. It never installs
Node, selects a hard-coded Node release, or contacts the network, so an
existing project `.nvmrc` remains available to NVM's normal behavior. When the
existing loader provides `NVM_BIN`, that already-selected runtime is placed
after safety shims and before Homebrew application paths. This lets an
operator-managed NVM/LTS policy win interactive Node resolution while
Homebrew's Node remains a dependency/fallback path.

Runtime choices are host data, never executable shell configuration. MZSH
uses `${XDG_CONFIG_HOME:-$HOME/.config}/mzsh/runtime-paths` (or
`MZSH_RUNTIME_PATHS_DIRECTORY` for an isolated test) only when it is a regular
current-user-owned non-symlink directory with exact mode `0700`. Inside it,
the fixed generic entries `python`, `ruby`, `go`, `postgresql`, `java`, and
`pnpm` may each be a directory symlink to an existing host-selected executable
directory. Invalid, missing, regular-file, or broken entries are ignored; an
unsafe root produces only a redacted diagnostic.

The repository never reads, parses, sources, or evaluates this boundary. It
adds the stable generic entry path after safety shims and an active NVM runtime
but ahead of inherited operating-system tools. A local race can therefore
change only a current-user-owned PATH directory target, never execute code
during shell startup. MZSH does not call package managers, install software,
query the network, or select a runtime version.

Stable loader files are closed managed programs. Installers and local startup
customizations must not append PATH changes or other commands after their
managed source line; adopt such a loader again through the guarded transaction
so the prior bytes are backed up and the replacement is atomic.

## Completion ownership

`completion-directories` registers Homebrew and Docker completion directories
before Oh My Zsh is sourced, so a framework-owned `compinit` observes them. If
the explicitly configured framework loads, it remains the completion owner;
otherwise MZSH calls `compinit` once and uses an owner-only cache directory
below `${XDG_CACHE_HOME:-$HOME/.cache}/mzsh`. `MZSH_COMPLETION_OWNER` states the
effective owner.

MZSH restores its own state after any module failure but cannot claim to roll
back arbitrary third-party framework state created while that framework was
sourced. The optional framework loader runs only in an interactive shell; a
missing framework, theme, or plugin remains a no-op.

## Optional FZF integration

`search.zsh` is interactive-only and does not run `fzf --zsh` or evaluate
generated shell text. To opt in, set `MZSH_FZF_SHELL_DIR` to a trusted local,
non-symlink directory containing regular readable `key-bindings.zsh` and
`completion.zsh` files. MZSH sources only those static files and does not
install FZF, search package-manager paths, or contact the network at startup.

## Local private boundary

Private exports belong in a regular local file outside the repository. The
default is `${XDG_CONFIG_HOME:-$HOME/.config}/mzsh/private.zsh`, or set
`MZSH_PRIVATE_ZSH` to another local file. MZSH accepts it only when it is
readable, regular, not a symlink, owned by the current user, and has no group or
world permissions (for example `0600`). Insecure or unverifiable overrides are
skipped. Permission helper functions are removed after initialization.

Diagnostics never print private paths, names, or values. With
`MZSH_OBSERVE=1`, module events are emitted as redacted module identifiers and
an insecure private file produces a generic skip message. Normal startup is
quiet.
