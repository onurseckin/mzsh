# Forensic Analysis: Terminal Stability, Dictation Input Streams, and PTY Lifecycle on macOS

**Date:** 2026-09-01  
**Scope:** macOS (Sonoma/Sequoia), WezTerm, Tmux, Zsh/MZSH, Antigravity CLI (`agy`), Bubble Tea Go TUIs, Raycast Dictation, Wispr Flow  
**Status:** Canonical Reference Report

---

## 1. Executive Summary

When using voice dictation tools (Raycast Dictation, Wispr Flow, Superwhisper, macOS Speech Recognition), rapid paste operations, or interactive navigation keystrokes on macOS, users intermittently observe interactive terminal applications (such as Antigravity CLI, Claude Code, or interactive shells) unexpectedly exiting or closing their active terminal panes.

Internal CLI logs during these occurrences record two specific patterns:

1. `Terminal gone, shutting down` (triggered by pseudo-terminal PTY disconnect / `EIO` / `SIGHUP`).
2. `CLI program exited, shutting down` (triggered by an internal TUI event loop termination signal, such as `tea.Quit` or `io.EOF`).

External research across GitHub issue trackers, developer forums, and macOS API documentation confirms that this behavior is **not isolated to a single CLI application**, but represents a multi-layered intersection across:

- **macOS Accessibility API Keystroke Injection (`CGEventPost` / `AXUIElement`) & Modifier State Bleed**
- **WezTerm Cocoa Menu Validation Crashes via Writing Tools & Accessibility Probes ([WezTerm Issue #6864](https://github.com/wez/wezterm/issues/6864))**
- **Go / Bubble Tea TUI Event Loop State Machine Transitions During Active Streaming**
- **Multiplexer Pane Lifecycle Rules (Tmux default pane destruction on child process exit)**

---

## 2. Technical Breakdown of Mechanisms

### A. Synthetic Keystroke Injection & Modifier State Bleed (`Ctrl+D` / `EOF` / `SIGINT`)

- **Text Injection Paths:** Voice dictation tools transcribe audio and insert text into the focused application using either:
  1. Synthetic key events (`CGEventPost` / `CGEventKeyboardSetUnicodeString`).
  2. Clipboard paste simulation (populating `NSPasteboard` and dispatching synthetic `Cmd+V`).
- **Modifier Flag Bleed:** When dictation is triggered via keyboard shortcuts involving modifier keys (e.g., `Cmd`, `Ctrl`, `Option`), physical or logical modifier states can momentarily linger during the synthetic keystroke dispatch.
- **Control Character Collisions:** If `Control` or `Command` flags are merged into the simulated keystroke stream, a transcribed character (such as `'d'`, `'c'`, or `'q'`) is delivered to the terminal PTY as `\x04` (`Ctrl+D` / `EOF`), `\x03` (`Ctrl+C` / `SIGINT`), or `\x11` (`Ctrl+Q`).
  - In interactive shells (Zsh, Bash) or Go TUIs (Bubble Tea, readline), receiving `\x04` (`EOF`) at the input buffer immediately triggers a standard clean exit sequence, yielding `CLI program exited, shutting down`.
  - In `tmux`, when the foreground process terminates cleanly, the pane closes immediately by default.

### B. WezTerm Cocoa Menu Validation Crashes via Accessibility Probes ([WezTerm Issue #6864](https://github.com/wez/wezterm/issues/6864))

- **The Conflict:** On macOS Sonoma and Sequoia, native Apple Intelligence "Writing Tools" and external accessibility extensions (like Raycast's "Search Menu Bar Items" or PopClip) continuously traverse open application menus via the macOS Accessibility API (`AXUIElement`).
- **The Failure:** When external tools probe WezTerm's menu items during active window focus, WezTerm's Cocoa event loop can fail menu validation, causing WezTerm to crash or drop the active window pane.
- **PTY Tear-Down:** When WezTerm crashes or drops a pane, the master pseudo-terminal (`/dev/ptmx`) is instantly severed. All child processes receive `SIGHUP` and read operations on `stdin` fail with `EIO` (Input/Output Error), logging `Terminal gone, shutting down`.

### C. Go TUI State Machine: Keypresses During Active Streaming (Bubble Tea Architecture)

- **Raw Mode & State Machine:** Interactive CLI tools built with Bubble Tea (`tea.Program`) operate the terminal in raw mode.
- **Input vs. Streaming States:**
  1. **Input Mode:** When the prompt is idle and waiting for user typing, keystrokes are appended to the textarea.
  2. **Streaming / Execution Mode:** When an AI model is streaming tokens or executing tool turns, the text entry buffer is locked.
- **Unhandled Control Keys:** Physical navigation keys (such as `End`, `Home`, `Option+Arrow`, `Shift+Enter`) send multi-byte ANSI Escape sequences (`\x1b...`). When received during an active streaming turn, unhandled escape sequences fall through to the top-level Bubble Tea command handler, which interprets unhandled control keys as `tea.Quit`, causing the CLI to exit cleanly.

### D. Multiplexer Lifecycle & Prefix Key Collisions

- **Prefix Interception:** If the Tmux prefix is mapped to a single punctuation character (such as backtick `` ` ``), any transcribed backticks in code blocks or markdown activate Tmux prefix mode.
- **Subsequent Hotkey Execution:** The subsequent transcribed characters can trigger destructive Tmux commands (such as `x` for `kill-pane` followed by `y` for confirmation).

---

## 3. Evidence Matrix & References

| Subsystem / Tool            | Symptom                                    | Primary Cause                                                                              | Reference / Citation                                                                                                   |
| :-------------------------- | :----------------------------------------- | :----------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------- |
| **WezTerm** (macOS)         | Crash / window drop on Raycast / dictation | Cocoa menu validation crash on Apple Intelligence & Accessibility menu traversal           | [WezTerm Issue #6864](https://github.com/wez/wezterm/issues/6864), [#4592](https://github.com/wez/wezterm/issues/4592) |
| **Antigravity CLI (`agy`)** | `"Terminal gone, shutting down"`           | PTY disconnect (`SIGHUP` / `EIO`) when parent terminal emulator or tmux pane closes        | Antigravity CLI Issue #134                                                                                             |
| **Raycast Dictation**       | Terminal abruptly closes on voice input    | Synthetic `CGEventPost` bursts inheriting active modifier flags (`Ctrl` -> `EOF` / `\x04`) | Raycast Community & Developer Discussions                                                                              |
| **Tmux**                    | Panes disappearing on child exit           | Process exits on `EOF` / `SIGINT`; tmux default setting destroys panes on child exit       | Tmux `remain-on-exit` specifications                                                                                   |
| **Bubble Tea / Go TUIs**    | Exit when typing during active streaming   | TUI event loop treating unhandled keys in locked streaming state as `tea.Quit`             | Charmbracelet Bubble Tea Architecture & Claude Code logs                                                               |

---

## 4. Recommended Mitigations & Hardening Strategies

### 1. Terminal & Multiplexer Hardening

- **Prevent Tmux Pane Closure on Exit:**
  Add the following to `~/.tmux.conf` so closed or exited processes leave the pane open for diagnostic review:
  ```tmux
  set -g remain-on-exit on
  ```
- **Prevent Accidental WezTerm Pane Close:**
  In `~/.wezterm.lua`:
  ```lua
  config.window_close_confirmation = "AlwaysPrompt"
  config.exit_behavior = "CloseOnCleanExit"
  ```
- **Mitigate WezTerm Accessibility Crash (#6864):**
  - Disable Raycast's **"Search Menu Bar Items"** command in Raycast Settings -> Extensions.
  - Disable macOS Apple Intelligence "Writing Tools" menu inspection if active.

### 2. Shell Configuration (`~/.zshrc` / MZSH)

- **Prevent Zsh Shell Exit on Accidental `Ctrl+D` (`EOF`):**
  Add to `~/.zshrc`:
  ```zsh
  setopt ignore_eof
  ```
  _(Requires typing `exit` explicitly to terminate the shell)._

### 3. Dictation Tool Configuration (Raycast / Wispr Flow)

- **Disable "Auto Submit" / "Send Enter":** In Raycast Dictation settings, disable auto-submit to prevent automatic execution of unbuffered input.
- **Isolate Modifiers:** Avoid hotkeys combining `Control` or `Command` for toggling dictation if dictating directly into raw terminal interfaces.

### 4. Interactive CLI Operational Discipline

- **Streaming Turn Isolation:** Avoid pressing navigation or control keys while model turns or tool execution streams are actively running in the foreground.
