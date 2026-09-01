# MZSH Terminal Stability, Voice Dictation Burst & Interruption Resilience Master Plan

> **Tracking ID:** `plan-mzsh-terminal-input-stability-and-antigravity-resilience`  
> **Repository:** `mzsh`  
> **Status:** `AUTHORIZED FOR OLT DUAL-ORCHESTRATOR EXECUTION`  
> **Target Subsystems:**
>
> - `portable/zsh/modules/` (prompt-vi, history, safety-shims, init.zsh)
> - `portable/tmux/.tmux.conf` & `portable/wezterm/.wezterm.lua`
> - `src/tui/`, `src/infrastructure/`, `src/cli/`
> - `tests/unit/`, `tests/integration/`
> - `.olt/capsules/input-stability/` & `.olt/capsules/terminal-resilience/`
>
> **Reference Standards:** OLT Governance Protocol, MZSH Architectural Decoupling, and Reversible Transactions  
> **Author:** Tier 0 Strategic Mind Supervisor  
> **Created:** 2026-09-01

---

## 1. Executive Problem Analysis in MZSH Context

The user has experienced terminal crashes, session drops, and Antigravity chat disconnects originating from shell/terminal environment interactions:

1. **Issue 1: Rapid Input, Key Hold & Voice Dictation Burst Overflow (Superwhisper / Whisper Pro)**
   - **Root Cause Context in MZSH:** When external voice-to-text engines (_Superwhisper_, _Whisper Pro_) or fast key hold repeats inject large character buffers into the active Zsh / TUI / PTY session, rapid bursts of raw stdin unbalance readline buffers, vi-mode command state transitions (`prompt-vi.zsh`), and history expansion hooks (`history.zsh`), causing stdin pipe breakage (`EPIPE`) or process exit.
   - **MZSH Domain Hardening:**
     - Harden Zsh input queue and ZLE (Zsh Line Editor) buffer handling.
     - Add bracketed-paste / IME burst protection in `portable/zsh/init.zsh` and `portable/zsh/modules/`.
     - Implement synthetic burst injectors (1,000–5,000 WPM) in `tests/integration/` to guarantee zero crashes under high-frequency character injection.

2. **Issue 2: Escape Key Interruption, Signal Trapping & Multiplexer Stability (MIMO / Tmux / WezTerm)**
   - **Root Cause Context in MZSH:**
     - Pressing `Escape` (`\x1b`) during active execution or idle states can trigger multiplexer command mode traps or propagate unhandled signals (`SIGINT`, `SIGHUP`, `SIGQUIT`) to the parent terminal session instead of isolating the child subprocess.
     - Multiplexers (MIMO, Tmux, WezTerm) with default `escape-time` settings or unmanaged prefix bindings can interpret rapid escape codes as detach or pane-kill events.
   - **MZSH Domain Hardening:**
     - Tune `portable/tmux/.tmux.conf` (`set -s escape-time 0`, pass-through flags, detach lockouts).
     - Tune `portable/wezterm/.wezterm.lua` (signal isolation, key table pass-through).
     - Harden Zsh trap handlers in `portable/zsh/modules/safety-shims.zsh` and signal forwarding in `src/infrastructure/process/`.
     - Create adversarial interruption test suites simulating 100 consecutive rapid Escape / keypress interruptions during compute and idle states.

---

## 2. Dual-Orchestrator Architecture in MZSH

```
+-----------------------------------------------------------------------------------+
|                         Tier 0 Strategic Mind Supervisor                          |
+-----------------------------------------+-----------------------------------------+
                                          |
                   +----------------------+----------------------+
                   |                                             |
+------------------v-------------------+     +-------------------v------------------+
|          Orchestrator 1              |     |          Orchestrator 2              |
|   (Input Stream & Voice Burst)       |     |  (Signal, Escape & Multiplexers)     |
+------------------+-------------------+     +-------------------+------------------+
                   |                                             |
         +---------+---------+                         +---------+---------+
         |                   |                         |                   |
+--------v-------+  +--------v-------+        +--------v-------+  +--------v-------+
|  Coordinator   |  |   Validators   |        |  Coordinator   |  |   Validators   |
| (ZLE/Burst UX) |  | (Stress/Tests) |        | (Tmux/Signals) |  | (PTY/Trap Sim) |
+----------------+  +----------------+        +----------------+  +----------------+
```

---

## 3. Disjoint Workstreams & Scopes in MZSH

### Workstream 1: Input Stream, Voice IME Ingestion & ZLE Buffer Hardening

- **Capsule:** `.olt/capsules/input-stability/`
- **Write Scope:** `portable/zsh/modules/prompt-vi.zsh`, `portable/zsh/init.zsh`, `src/infrastructure/terminal/`, `tests/unit/terminal/`, `tests/integration/burst/`
- **Key Deliverables:**
  - Bracketed paste mode and high-speed burst buffer protection in ZLE.
  - Non-blocking stdin ingestion with ring-buffer backpressure.
  - Synthetic voice burst testing (1,000–5,000 WPM) with 100% character integrity and 0 crashes.

### Workstream 2: Signal Trapping, Escape Interruption & Multiplexer Protection

- **Capsule:** `.olt/capsules/terminal-resilience/`
- **Write Scope:** `portable/tmux/.tmux.conf`, `portable/wezterm/.wezterm.lua`, `portable/zsh/modules/safety-shims.zsh`, `src/infrastructure/process/`, `tests/unit/process/`, `tests/integration/signals/`
- **Key Deliverables:**
  - Tmux & WezTerm escape-time optimization and key-table pass-through to prevent pane detach/close on Escape.
  - Subprocess signal trap isolation (`SIGINT`, `SIGTERM`, `SIGHUP`) preventing parent session termination.
  - Reconnection and heartbeat resilience in TUI / session managers.
  - 100-cycle rapid Escape interruption stress test with 0 connection drops.

---

## 4. OLT Quality Invariants & Verification

1. **Strict Monorepo Scope:** All operations, files, and tests strictly confined to repository root.
2. **Zero TypeScript `any` and Zero Suppressions:** Strict compliance across all TS modules.
3. **Two-Key Verification:** Mechanical AST gate (`bun harness.ts task:check`) + Empirical Stress Tests (`bun test tests/integration/`).
4. **Reflog Safety:** Immediate `git add -A` upon task slice completion.
