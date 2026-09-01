# Portable Tmux Foundation

[Index: repository README](../../README.md)

`portable/tmux` is MZSH's non-secret terminal multiplexer foundation. It contains reproducible configuration contracts and keybinding models for Tmux across environments.

## Overview

- **Leader / Prefix**: Configured to `` ` `` (backtick) for ergonomic keyboard access (`bind ` send-prefix`).
- **Escape Latency**: `set -s escape-time 0` for instantaneous mode-switching and zero keystroke latency.
- **Pass-through**: `set -g allow-passthrough on` and `extended-keys on` for WezTerm and terminal emulator compatibility.
- **Detach Protection**: `unbind C-d` to prevent accidental multiplexer detach on rapid Escape or Ctrl-D keystrokes.
- **1-Based Indexing**: `base-index 1` and `pane-base-index 1` for 1-based keyboard matching.
- **Pane Splitting**: `v` for vertical split (top/bottom) and `b` for horizontal split (left/right), preserving current working directory (`-c "#{pane_current_path}"`).
- **Pane Navigation & Resizing**: `Alt + Arrow keys` (root-level), directional selectors (`h/j/k/l`), and repeatable resize keys (`H/J/K/L`).
- **Pane Zoom**: `f` (`resize-pane -Z`) for single-key pane zoom toggling.
- **Vi Copy Mode**: `Enter` / `Escape` to enter copy mode, with vi navigation and system clipboard integration (`pbcopy`).

## Integrated Plugins

- `tpm`: Tmux Plugin Manager (`prefix + I` to install, `prefix + U` to update, `prefix + Alt-u` to clean).
- `tmux-which-key`: Popup keybinding guidance and categorized chord explorer triggered via `prefix + ?`.
- `tmux-menus`: Interactive popup menu explorer triggered via `prefix + \`.
- `tmux-fzf`: Interactive fuzzy finder for panes, windows, sessions, and keybindings triggered via `prefix + F`.
- `tmux-thumbs`: Vimium-style hint jump and copy triggered via `prefix + Space`.
- `extrakto`: Fast fuzzy text and path extractor triggered via `prefix + Tab`.
- `tmux-resurrect` & `tmux-continuum`: Automated and manual session persistence (`prefix + Ctrl-s` / `prefix + Ctrl-r`) with automatic background restore.
- `tmux-yank`: Enhanced clipboard integration.
- `tmux-autoreload`: Automatic configuration reload on file change.
