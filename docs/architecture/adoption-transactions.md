# Adoption Transactions and Rollbacks

[Previous: managed shell topology](managed-shell-topology.md) ·
[Index: architecture](README.md) ·
[Next: CLI and discovery](cli-and-discovery.md)

MZSH enforces transactional state changes whenever modifying host shell files. Every mutation follows a planned review lifecycle and creates an immutable receipt for safe rollback.

## Transaction Lifecycle

1. **Audit & Plan**: Running `audit`, `bootstrap`, `setup`, or `update` without `--apply` runs in dry-run mode. It inspects existing files, creates diffs, checks repository safety, and computes a unique reviewed plan identifier.
2. **Review**: The operator reviews the proposed changes, affected files, and sensitive assignment detections.
3. **Execution with Confirmation**: Supplying `--apply`, `--plan-id <id>`, and `--confirm APPLY` applies the reviewed plan.
4. **Preflight & Backups**: Before writing any file, existing files are backed up to an owner-only directory (`~/.config/mzsh/backups/<receipt-id>`).
5. **Atomic Application**: Target loaders and links are written atomically. If any write fails, MZSH attempts rollback of all staged writes.
6. **Receipt Publication**: A receipt JSON document is written to `~/.config/mzsh/receipts/<receipt-id>.json`.

## Rollback Guarantees

- **Dry-run verification**: `bun run mzsh -- rollback <receipt-id>` verifies that current managed files match the receipt before attempting restoration.
- **Atomic restoration**: `bun run mzsh -- rollback <receipt-id> --apply` restores original backups and marks the receipt as rolled back.
- **Orphan resilience**: Receipts retain full backup copies of replaced files, allowing rollback even if the source repository checkout is removed.
