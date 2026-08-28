# CLI Architecture, Discovery, and TUI

[Previous: adoption transactions](adoption-transactions.md) ·
[Index: architecture](README.md) ·
[Next: safety shims](safety-shims.md)

MZSH exposes its capabilities through a unified command catalog that powers the CLI parser, Commander adapter, automated shell completion, and the OpenTUI terminal interface.

## Command Catalog

The central `CommandCatalog` in `src/catalog/command-catalog.ts` defines:

- Command names, summaries, and risk levels (`read-only`, `destructive`, `sensitive`).
- Strict flag and positional argument grammar.
- Palette metadata and search keywords.
- OpenTUI keybindings (Space-leader shortcuts and Neovim-style navigation).
- Shell completion generators for Zsh.

## Observational Machine Inventory

The `inventory` command queries system state without modifying the host environment.

- **Stable Categories**: Applications, runtimes, package managers, shell configurations, scripts, and PATH entries.
- **Safe Probes**: Executes read-only checks (e.g. `bun --version`, `brew --version`) using fixed arguments.
- **Redacted Output**: Machine inventory strips private paths and sensitive environment assignments from both JSON and human-readable views.

## OpenTUI Terminal Interface

The `tui` command launches an interactive full-screen interface built on React and `@opentui/react`:

- **Leader Navigation**: `Space` is the leader key; screens are bound to standard Vim shortcuts (`gd` for Dashboard, `gp` for Plan Review, `gh` for History).
- **Zero Mutation Route**: The TUI only views state and reviews plans; executing destructive mutations delegates to the confirmed transaction service.
