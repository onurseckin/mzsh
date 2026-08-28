# Bootstrapping an Existing Zsh Setup

[Previous: audit and read findings](audit-and-read-findings.md) ·
[Index: guides](README.md) ·
[Next: update a checkout](update-a-checkout.md)

When adopting a machine with an existing custom `.zshrc`, MZSH can inspect the legacy file, classify plain variable assignments, and extract them into the owner-only private environment.

## Step 1: Dry-run Adoption with Legacy Source

Plan the adoption while specifying the legacy configuration file:

```sh
bun run mzsh -- bootstrap --source "$PWD" --legacy-source /absolute/file
```

MZSH will:

1. Scan the legacy file for non-sensitive variable assignments.
2. Plan backups for existing `~/.zshenv`, `~/.zprofile`, and `~/.zshrc`.
3. Report the number of extracted assignments and skipped complex commands.

## Step 2: Review and Apply

Once verified, apply the transaction:

```sh
bun run mzsh -- bootstrap --source "$PWD" --legacy-source /absolute/file --apply
```

Existing shell files are backed up, new loaders are placed, and extracted variables are written to `~/.config/mzsh/private.zsh`.
