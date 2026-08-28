# Managed Shell Topology

[Previous: architecture index](README.md) ·
[Index: architecture](README.md) ·
[Next: adoption transactions](adoption-transactions.md)

MZSH manages host shell startup through small, deterministic loader scripts that delegate to a versioned portable shell tree. It avoids polluting the user's home directory with ad-hoc shell fragments while guaranteeing safe recovery and idempotency.

## Entrypoint Loaders

MZSH installs three stable loaders into the user's home directory:

1. `~/.zshenv`: Sourced by all Zsh invocations. Records portable context and loader boundaries only. It never defines aliases, prompts, completions, or exports credentials.
2. `~/.zprofile`: Sourced for login shells. Loads `login-manifest.zsh` to establish deterministic PATH precedence without loading plugins or private values.
3. `~/.zshrc`: Sourced for interactive shells. Evaluates `init.zsh` which sources `manifest.zsh` to establish full interactive shell capabilities.

## Execution Order

The interactive manifest (`manifest.zsh`) enforces a fixed sequence:

1. `observability`: Sets up error handling and diagnostics.
2. `path`: Configures base system and package manager PATH entries.
3. `safety-shims`: Inserts safety wrappers first in PATH.
4. `macports`: Adds MacPorts paths if present.
5. `homebrew`: Adds Homebrew paths if present.
6. `bun`: Adds Bun binary directory.
7. `nvm`: Resolves active NVM binary directory without invoking network or installation.
8. `rust`: Adds Cargo bin directory.
9. `android`: Adds Android SDK tools if configured.
10. `runtime-paths`: Integrates generic user runtime symlinks.
11. `completion-directories`: Registers completion fpaths.
12. `oh-my-zsh`: Loads framework if installed.
13. `completion`: Runs single cached `compinit` if framework did not initialize.
14. `prompt-vi`: Configures prompt and vi keybindings.
15. `aliases`: Registers standard aliases.
16. `search`: Integrates optional static FZF bindings.
17. `history`: Configures shell history settings.
18. `dburl`: Configures database URL helpers with redaction.
19. `ports-manager`: Registers port inspection tools.
20. `private`: Sources owner-only local private file last.

## Private State Boundary

Private exports and secrets are stored in `${XDG_CONFIG_HOME:-$HOME/.config}/mzsh/private.zsh`. This file is owned by the current user with `0600` permissions and is never checked into Git or copied into managed receipts.
