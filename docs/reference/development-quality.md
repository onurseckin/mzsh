# Development and Quality Standards

[Previous: managed files and receipts](managed-files-and-receipts.md) ·
[Index: reference](README.md) ·
[Next: decisions index](../decisions/README.md)

MZSH enforces automated quality gates and zero-tolerance code safety standards.

## Quality Commands

```sh
mise exec -- bun run quality:check
bun run build:ts
bun run test:unit
bun run test:integration
bun run validate
```

## Toolchain Components

- **Oxlint & Oxfmt**: Fast Rust-based TypeScript linting and formatting.
- **ShellCheck & shfmt**: Static analysis and canonical formatting for all portable Zsh scripts.
- **Lefthook**: Enforces pre-commit quality checks locally.
- **Bun Test**: Unit testing with `--no-isolate` and isolated fixture integration testing.

## Code Standards

- **Strict Types**: No `any`, `unknown` with guards where necessary, strict TypeScript compiler options.
- **No Suppressions**: No `@ts-ignore`, `@ts-expect-error`, or linter suppression directives.
- **Line Limit**: Every TypeScript source and test file must remain under 400 lines.
- **No Code Comments**: Architecture documents and tests are the source of truth for design rationale.
