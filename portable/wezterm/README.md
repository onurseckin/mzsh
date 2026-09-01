# Portable WezTerm Configuration

[Index: repository README](../../README.md)

`portable/wezterm` is MZSH's portable, non-secret terminal emulator configuration foundation for WezTerm.

## Overview

- **Font**: MesloLGS Nerd Font Mono, 14.0pt, line height 1.2.
- **Window Styling**: Border-only decorations (`RESIZE`), 90% opacity with macOS native window blur (blur factor 20).
- **Cursor**: Steady vertical bar (`SteadyBar`) with custom blue accent (`#7aa2f7`).
- **Tab Bar**: Disabled (`enable_tab_bar = false`), delegating session tabs and status management directly to Tmux.
- **Modifier Isolation**: Left Option configured as Meta/Alt modifier (`send_composed_key_when_left_alt_is_pressed = false`) for deterministic command escaping.
- **macOS Readline Keybindings**:
  - `Option + Left` (`\x1bb`) / `Option + Right` (`\x1bf`): Word backward / forward navigation
  - `Cmd + Left` (`\x01`) / `Cmd + Right` (`\x05`): Beginning of line (Ctrl-A) / end of line (Ctrl-E)
  - `Option + Backspace` (`\x17`): Delete previous word (Ctrl-W)
  - `Cmd + Backspace` (`\x15`): Delete to beginning of line (Ctrl-U)
  - `Cmd + Delete` (Fn+Backspace): Delete to end of line (Ctrl-K)
  - `Shift + Enter` (`\x1b\r`): Escaped newline for REPL / agent tool compatibility
- **Hyperlink Rules & Deep Linking**: Automated path and URL regex matching with deep linking to open files and line numbers in Neovim split panes.
- **Multiplexer Integration**: Clean signal isolation and latency-free escape forwarding for seamless tmux and MIMO compatibility.
