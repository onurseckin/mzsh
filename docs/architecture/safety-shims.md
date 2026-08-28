# Safety Shims and Command Interception

[Previous: CLI and discovery](cli-and-discovery.md) ·
[Index: architecture](README.md) ·
[Next: guide index](../guide/README.md)

MZSH installs a safety-shim directory at the highest priority in `$PATH` to guard against common destructive command errors.

## Shim Allowlist

The shim directory provides wrappers for sensitive commands:

- `rm`: Prevents accidental recursive removal of system root or protected user paths (`rm -rf /`, `rm -rf ~`).
- `chmod`, `chown`: Blocks unintended recursive root permission modifications.
- `dd`: Warns on raw disk write destinations without confirmation.
- `mkfs`: Guards filesystem formatting against active mounts.
- `git`: Intercepts unconfirmed force-pushes to protected branches.

## Execution Policy

1. **Precedence**: `~/.config/mzsh/shims` is prepended to `$PATH` in `login-manifest.zsh` and `manifest.zsh`.
2. **Safe Pass-through**: Non-destructive invocations pass directly to the underlying system binary with zero overhead.
3. **Fail-closed Interception**: If arguments match dangerous patterns, the shim halts execution and outputs an actionable warning.
