# Updating a Managed Checkout

[Previous: bootstrap existing zsh](bootstrap-existing-zsh.md) ·
[Index: guides](README.md) ·
[Next: rollback and recovery](rollback-and-recovery.md)

MZSH supports clean fast-forward updates to sync shell modules and tool manifests across your machines.

## Update Procedure

1. **Pull Latest Changes**: Use Git to pull updates into your local checkout:

```sh
git pull --ff-only
```

2. **Plan Local Update**: Inspect changes to loaders and modules before applying:

```sh
bun run mzsh -- update
```

3. **Apply Update**:

```sh
bun run mzsh -- update --apply
```

## Repository Safety Invariants

MZSH update checks guard against uncommitted changes and split histories:

- If working tree is dirty, update halts without mutating files.
- If local commits are unpushed, update halts before fetching origin.
- If remote has diverged, fast-forward is blocked until manually resolved.
