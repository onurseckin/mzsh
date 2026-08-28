# MZSH

MZSH is a managed, reversible Zsh configuration foundation and developer-tool utility. It audits a local machine, plans an adoption without changing it by default, and records receipts and protected backups for rollback. It does not install runtimes, fetch updates, or copy private values into the repository.

## Quick Start

1. Clone a reviewed checkout and enter it:

   ```sh
   git clone git@github.com:onurseckin/mzsh.git mzsh
   cd mzsh
   ```

2. Install checkout dependencies:

   ```sh
   bun install
   ```

3. Audit the local environment:

   ```sh
   bun run mzsh -- audit
   ```

4. Plan and apply initial adoption:

   ```sh
   bun run mzsh -- bootstrap --source "$PWD"
   bun run mzsh -- bootstrap --source "$PWD" --apply
   ```

## Daily Workflow

```sh
# Read-only report before changes or recovery
bun run mzsh -- audit

# Plan and apply local adoption updates
bun run mzsh -- update
bun run mzsh -- update --apply

# Inspect and restore an adoption transaction
bun run mzsh -- rollback receipt-id
bun run mzsh -- rollback receipt-id --apply

# Inspect machine inventory (read-only)
bun run mzsh -- inventory
bun run mzsh -- inventory runtimes --json

# Manage private environment variable names securely
bun run mzsh -- env list
bun run mzsh -- env get TOKEN_NAME
bun run mzsh -- env set TOKEN_NAME

# Launch the full-screen terminal interface
bun run mzsh -- tui
```

## Safety Model

- **Transactional Adoption**: Every filesystem change is planned first and backed by an immutable receipt and pre-adoption backup.
- **Private State Boundary**: Private variables and tokens live in owner-only (`0600`) storage and are never checked into Git or written to receipts.
- **Observational Discovery**: Inventory and audit commands observe system state through fixed read-only probes without mutating host tools.
- **Safety Shims**: Intercepts dangerous recursive commands before system execution.

## Documentation

- [Guides](docs/guide/README.md): Step-by-step tutorials and how-to guides.
- [Architecture](docs/architecture/README.md): Managed shell topology, transactions, and system designs.
- [Reference](docs/reference/README.md): CLI specifications, audit findings, and file schemas.
- [Architecture Decisions](docs/decisions/README.md): Numbered ADR records.
- [Portable Shell Foundation](portable/zsh/README.md): Code-adjacent shell module and loader contracts.
- [Development and Quality](docs/reference/development-quality.md): Toolchain commands, linting, and testing gates.
