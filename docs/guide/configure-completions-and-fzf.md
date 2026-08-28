# Configuring Completions and FZF

[Previous: configure private and runtime paths](configure-private-and-runtime-paths.md) ·
[Index: guides](README.md) ·
[Next: reference index](../reference/README.md)

MZSH manages completion initialization cleanly, ensuring fast shell startup and conflict-free tab completion.

## Completion Management

- **Single Initialization**: If Oh My Zsh is present, it manages `compinit`. Otherwise, MZSH initializes completion once with an owner-only cache under `~/.cache/mzsh/zcompdump`.
- **Docker Completions**: Set `MZSH_DOCKER_COMPLETION_DIR` in `~/.config/mzsh/private.zsh` to point to your Docker CLI completion directory.
- **Homebrew Completions**: Homebrew `site-functions` are registered automatically when Homebrew is detected.

## Static FZF Integration

To enable FZF keybindings without dynamic eval at startup:

1. Locate static `key-bindings.zsh` and `completion.zsh` files.
2. In `~/.config/mzsh/private.zsh`, export:
   ```zsh
   export MZSH_FZF_SHELL_DIR="/path/to/fzf/shell"
   ```
3. MZSH sources only regular readable static files from this directory.
