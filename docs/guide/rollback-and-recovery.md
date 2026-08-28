# Rollback and Disaster Recovery

[Previous: update a checkout](update-a-checkout.md) ·
[Index: guides](README.md) ·
[Next: configure private and runtime paths](configure-private-and-runtime-paths.md)

MZSH records an immutable receipt and file backups for every applied adoption transaction, allowing complete reversal to pre-adoption state.

## Step 1: Locate the Receipt ID

List existing receipts in your configuration state directory or check previous output:

```sh
ls ~/.config/mzsh/receipts
```

## Step 2: Dry-run the Rollback

Verify the rollback plan and ensure managed files have not been externally modified:

```sh
bun run mzsh -- rollback receipt-id
```

## Step 3: Apply the Rollback

Restore all original files from the protected backup:

```sh
bun run mzsh -- rollback receipt-id --apply
```

MZSH restores your previous `.zshenv`, `.zprofile`, and `.zshrc`, removes the `current` and shim links, and atomically marks the receipt as rolled back.
