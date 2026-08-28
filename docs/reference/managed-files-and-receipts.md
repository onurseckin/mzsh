# Managed Files and Receipts Reference

[Previous: audit findings](audit-findings.md) ·
[Index: reference](README.md) ·
[Next: development quality](development-quality.md)

MZSH maintains strict boundaries between host files, managed loaders, receipts, backups, and operational history.

## Managed File Topology

| File / Path                     | Mode    | Purpose                                                   |
| ------------------------------- | ------- | --------------------------------------------------------- |
| `~/.zshenv`                     | `0644`  | Stable all-shell loader.                                  |
| `~/.zprofile`                   | `0644`  | Stable login-shell loader.                                |
| `~/.zshrc`                      | `0644`  | Stable interactive-shell loader.                          |
| `~/.config/mzsh/current`        | Symlink | Symlink pointing to active `portable/zsh` directory.      |
| `~/.config/mzsh/shims`          | Symlink | Symlink pointing to safety shims directory.               |
| `~/.config/mzsh/private.zsh`    | `0600`  | Local private exports and tokens.                         |
| `~/.config/mzsh/runtime-paths/` | `0700`  | Directory containing user runtime symlinks.               |
| `~/.config/mzsh/receipts/`      | `0700`  | Directory containing immutable JSON transaction receipts. |
| `~/.config/mzsh/backups/`       | `0700`  | Directory containing pre-adoption file backups.           |
| `~/.config/mzsh/history.sqlite` | `0600`  | Bun SQLite 30-day operational action history database.    |

## Receipt Schema

Each applied transaction generates a receipt JSON file:

- `id`: Unique receipt identifier string.
- `createdAt`: ISO 8601 creation timestamp.
- `source`: Absolute path and commit SHA of the source repository.
- `files`: Array of managed file records (target path, backup path, checksum).
- `status`: Transaction status (`applied` or `rolled-back`).
