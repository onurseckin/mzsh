# Audit and Read Findings

[Previous: new machine setup](new-machine.md) ·
[Index: guides](README.md) ·
[Next: bootstrap existing zsh](bootstrap-existing-zsh.md)

MZSH provides a read-only audit command to analyze the active shell environment, identify shadowing conflicts, and verify configuration health.

## Running Audit

To generate a human-readable audit report:

```sh
bun run mzsh -- audit
```

To output machine-readable JSON for automation:

```sh
bun run mzsh -- audit --json
```

## Interpreting Finding Severity

- **Informational**: Notes available tool suites, framework configurations, and optional capabilities (e.g. Docker completions, Java discovery).
- **Warning**: Highlights path collisions, duplicate tool managers, or potential shadowing (e.g. Homebrew Node vs. NVM Node).
- **Error**: Flags security issues, broken symlinks, insecure file permissions (e.g. world-writable private files), or invalid shell syntax.

See [Audit Findings Reference](../reference/audit-findings.md) for full catalog details.
