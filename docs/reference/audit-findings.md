# Audit Findings Reference

[Previous: CLI reference](cli.md) ·
[Index: reference](README.md) ·
[Next: managed files and receipts](managed-files-and-receipts.md)

The MZSH audit subsystem emits standardized finding codes across three severity levels.

## Finding Codes

| Code                     | Severity      | Description                                                                                  |
| ------------------------ | ------------- | -------------------------------------------------------------------------------------------- |
| `RUNTIME_DISCOVERY`      | Informational | Detected active runtimes (e.g. Bun, Node, Python, Rust, Go).                                 |
| `FRAMEWORK_PRESENT`      | Informational | Detected existing Oh My Zsh or other framework directory.                                    |
| `COMPLETION_CACHE`       | Informational | Reports status and owner of Zsh completion dump.                                             |
| `PATH_SHADOW_RUNTIME`    | Warning       | Detected multiple versions or managers for the same binary (e.g. NVM Node vs Homebrew Node). |
| `LEGACY_CONFIG_FOUND`    | Warning       | Found existing `.zshrc` with custom unmanaged configurations.                                |
| `INSECURE_PRIVATE_FILE`  | Error         | Private configuration file has group- or world-readable permissions.                         |
| `BROKEN_RUNTIME_SYMLINK` | Warning       | Configured runtime path symlink points to a non-existent target.                             |
| `SYNTAX_ERROR`           | Error         | A portable module or private file contains invalid Zsh syntax.                               |

## Redaction and Safety

Audit output never prints raw file contents, secrets, database passwords, or unredacted token values.
