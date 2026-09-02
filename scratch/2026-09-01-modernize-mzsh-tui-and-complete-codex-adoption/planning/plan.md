# Implementation Plan

## Objectives & Requirements

- **req-tui-keyboard-event-loop**: Ensure robust OpenTUI event loop, Space leader key navigation, exit handlers (q, Ctrl+C, Esc), and component focus
- **req-tui-dashboard-inventory**: Integrate live host machine inventory, package status, runtime versions, and Homebrew formulas into the OpenTUI dashboard
- **req-bare-mzsh-entrypoint**: Establish bare mzsh entrypoint launching OpenTUI dashboard while cleanly routing catalog and CLI subcommands
- **req-codex-adoption-reconciliation**: Reconcile adoption lifecycle, machine manifest reader, safe migration, and receipt verification across application and infrastructure

## Tasks & Scopes

### task-tui-keyboard-event-loop: Fix OpenTUI keyboard input handling, leader navigation, exit bindings, and focus management

- **Dependencies**: None
- **Write Scope**:
  - `src/tui`
- **Gate**: `bun test tests/unit/tui`

### task-tui-dashboard-inventory: Wire real machine inventory, package versions, Homebrew formulas, and runtimes into Dashboard screen

- **Dependencies**: task-tui-keyboard-event-loop
- **Write Scope**:
  - `src/tui/screens`
- **Gate**: `bun test tests/unit/inventory`

### task-bare-mzsh-entrypoint: Make bare mzsh launch OpenTUI dashboard directly, routing arguments cleanly to catalog commands

- **Dependencies**: task-tui-dashboard-inventory
- **Write Scope**:
  - `src/index.ts`
  - `bin/run-standalone.ts`
- **Gate**: `bun test tests/unit/mzsh-cli.test.ts`

### task-codex-adoption-reconciliation: Complete unfinished adoption lifecycle tasks from Codex session (safe migration, machine manifest reader, receipt verification)

- **Dependencies**: None
- **Write Scope**:
  - `src/application`
  - `src/infrastructure`
- **Gate**: `bun run validate`
