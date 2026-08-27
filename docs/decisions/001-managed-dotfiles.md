# ADR-001: Managed reversible dotfiles

## Status

Accepted

## Date

2026-08-26

## Context

Shell startup files are security-sensitive and machine-specific. A lexical
`source` loop makes ownership, load order, completion initialization, and
rollback ambiguous. Traditional global install/reinstall/uninstall scripts can
also mutate a home directory without a receipt or a reversible boundary.

MZSH needs a portable public configuration surface while keeping local
credentials and application-specific state private. Adoption must be safe to
plan, safe to retry after failure, and recoverable after a repository checkout
moves or disappears.

## Decision

Use a managed topology with these boundaries:

- Three stable home-directory loaders are the only shell entrypoints. They
  source an XDG-managed `current` portable tree and stay quiet outside their
  applicable shell context.
- A single explicit manifest owns interactive module order. It loads private
  configuration last, after public observability, path, completion, and
  interactive modules.
- A private local file is a current-user-owned, non-symlink regular file with
  owner-only permissions. It is not repository content or receipt metadata.
- Audit, bootstrap, update, and rollback are local-only managed commands.
  Bootstrap/update are dry runs unless `--apply` is explicit; rollback uses the
  receipt and protected backups rather than repository availability.
- The default menu presents managed loaders, the private boundary, and portable
  modules before legacy files labeled as migration context.
- Safety shims win PATH resolution. An already selected NVM runtime follows;
  Homebrew Node is a dependency/fallback path. MZSH does not install Node or
  call NVM to choose a version.

## Alternatives considered

### Source every file in a configuration directory

Rejected because filesystem order obscures dependencies and makes failure
rollback/completion ownership non-deterministic.

### Mutate global package links and shell files during install/update/uninstall

Rejected because those operations cannot prove which content they own or restore
a reviewed prior state. Managed receipts preserve a narrow, auditable boundary.

### Evaluate FZF-generated shell integration

Rejected because generated shell output requires evaluation at startup. MZSH
only allows opt-in sourcing of two static, readable local integration files.

## Consequences

- Operators provide a local checkout and explicitly accept plans; MZSH does not
  fetch, install host tools, or infer a private configuration.
- Old source-all files remain visible as migration context, not as the default
  managed configuration surface.
- The receipt/backups are operational data and must remain protected until an
  applied rollback marks the transaction unavailable.
- Shell integrations and runtime managers remain optional dependencies with
  documented ownership and path precedence.
