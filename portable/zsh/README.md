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
- `loaders/zprofile.zsh` marks the login context and only records the portable
  root. A managed host loader can use this boundary for login-only path policy.
- `loaders/zshrc.zsh` marks the interactive context and sources `init.zsh` only
  for an interactive Zsh session.

`init.zsh` is same-shell idempotent. It snapshots PATH and fpath before an
attempt. If an MZSH module fails, it restores those values and removes
initialization-owned trace, version, completion, policy, and helper state before
clearing the sentinel, allowing a corrected retry. A successful load publishes
`MZSH_PORTABLE_ZSH_VERSION=1` and the ordered `MZSH_LOADED_MODULES` array.

## Manifest and module order

`manifest.zsh` is the only module loader; it does not use glob order. Its
successful module trace is: `observability`, `path`, `homebrew`, `bun`, `nvm`,
`rust`, `android`, `private`, `completion-directories`, `oh-my-zsh`, and
`completion`.

The path module places `MZSH_COMMAND_SHIM_DIR` ahead of application and
inherited PATH entries, ignores missing application directories, and
canonicalizes equivalent existing absolute directory variants while preserving
their first precedence. Application roots are supplied explicitly; no
architecture-specific Homebrew default is assumed.

## Variables and tool policy

| Variable | Purpose |
| --- | --- |
| `MZSH_COMMAND_SHIM_DIR` | Existing command-safety shim directory, registered first. |
| `MZSH_HOMEBREW_PREFIX` | Homebrew prefix used for `bin`, `sbin`, and its Zsh completion directory. |
| `BUN_INSTALL` | Bun installation root. |
| `NVM_DIR` | Existing NVM installation root. |
| `CARGO_HOME` | Rust/Cargo root; defaults to the conventional home-relative location. |
| `ANDROID_HOME` / `ANDROID_SDK_ROOT` | Android SDK root; `ANDROID_HOME` wins when both are set. |
| `MZSH_OH_MY_ZSH_ROOT` | Explicit Oh My Zsh root. |
| `MZSH_DOCKER_COMPLETION_DIR` | Existing Docker completion directory to register before completion initialization. |
| `MZSH_PRIVATE_ZSH` | Optional local private-file override. |
| `MZSH_OBSERVE=1` | Enables redacted diagnostics on stderr. |

NVM has the auditable policy `MZSH_NVM_POLICY=existing-installation-only`.
Startup sources `nvm.sh` only when that file already exists. It never installs
Node, selects a hard-coded Node release, or contacts the network, so an
existing project `.nvmrc` remains available to NVM's normal behavior.

## Completion ownership

`completion-directories` registers Homebrew and Docker completion directories
before Oh My Zsh is sourced, so a framework-owned `compinit` observes them. If
the explicitly configured framework loads, it remains the completion owner;
otherwise MZSH calls `compinit` once and uses an owner-only cache directory
below `${XDG_CACHE_HOME:-$HOME/.cache}/mzsh`. `MZSH_COMPLETION_OWNER` states the
effective owner.

The framework source is the deliberate irreversible boundary: all MZSH stages
that can fail run before it. When the framework loads successfully, the only
remaining framework path is the non-failing ownership selection. MZSH restores
its own state after a failure but does not claim to roll back arbitrary
third-party framework state created while that framework was sourced.

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
