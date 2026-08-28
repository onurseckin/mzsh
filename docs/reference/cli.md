# CLI Reference

[Previous: reference index](README.md) ·
[Index: reference](README.md) ·
[Next: audit findings](audit-findings.md)

MZSH provides a strictly parsed, catalog-driven command-line interface.

## Command Catalog Syntax

```text
bun run mzsh -- audit [--source /absolute/checkout] [--json]
bun run mzsh -- bootstrap --source /absolute/checkout [--legacy-source /absolute/file] [--apply] [--plan-id reviewed-plan-id] [--confirm APPLY]
bun run mzsh -- update [--apply] [--plan-id reviewed-plan-id] [--confirm APPLY]
bun run mzsh -- rollback receipt-id [--apply] [--plan-id reviewed-plan-id] [--confirm APPLY]
bun run mzsh -- setup [--apply] [--plan-id reviewed-plan-id] [--confirm APPLY]
bun run mzsh -- inventory [category] [--json]
bun run mzsh -- env <list|get|set> [name] [--json]
bun run mzsh -- tui
```

## Commands and Options

### `audit`

Inspects host environment, shell loaders, runtime paths, and tool discovery.

- `--source <path>`: Specify an absolute checkout root.
- `--json`: Output report as JSON.

### `bootstrap`

Plans or applies initial managed shell adoption.

- `--source <path>`: (Required) Absolute path to MZSH checkout.
- `--legacy-source <path>`: Optional path to legacy configuration file to extract variables from.
- `--apply`: Apply the adoption transaction.
- `--plan-id <id>`: Reviewed plan ID.
- `--confirm APPLY`: Literal confirmation token.

### `update`

Plans or applies a local checkout update.

- `--apply`: Apply the update transaction.
- `--plan-id <id>`: Reviewed plan ID.
- `--confirm APPLY`: Literal confirmation token.

### `rollback`

Restores backed-up configuration files from a previous adoption.

- `<receipt-id>`: (Required) Target receipt identifier.
- `--apply`: Apply restoration.

### `setup`

Plans or executes the global MZSH installation and shell reconciliation lifecycle.

- `--apply`: Apply setup transaction.

### `inventory`

Inspects observational machine inventory.

- `[category]`: Optional category filter (e.g. `applications`, `runtimes`, `managers`, `shell`, `scripts`, `path`, `environment`).
- `--json`: Output as JSON.

### `env`

Manages private environment variable names securely.

- `list`: List defined environment variable names.
- `get <name>`: Check whether variable exists.
- `set <name>`: Open secure interactive boundary to update variable.
- `--json`: Output metadata as JSON.

### `tui`

Launches full-screen interactive terminal interface.

## Exit Codes

- `0`: Success.
- `1`: Operation failure (safety check stopped execution, transaction aborted).
- `2`: Usage error (unknown command, missing required argument, invalid flag syntax).

## Retired Flags

Passing `--update`, `--reinstall`, or `--uninst` outputs migration guidance and halts without making changes.
