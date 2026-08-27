# Task 6 report — safe setup lifecycle

## Delivered

- Added reviewed `setup` planning and application with serialized clone, fast-forward, Bun link, and shell reconciliation operations.
- Added fixed-argument Git execution and repository safety guards that block dirty, diverged, and unpushed work before fetch.
- Added owner-safe, idempotent stable-loader reconciliation and a global Bun link adapter.
- Exposed the plan-first `setup` command through the catalog and CLI, with reviewed-plan history integration.

## Verification

- `bun run validate` passed: 87 unit and 83 integration tests.
- `bunx --no-install lefthook run pre-commit` completed; the hook had no staged files to inspect.
- `git diff --check` passed.

## Review fix round 1

- Routed both `setup` and `update` through the reviewed lifecycle command path; apply requires a stored matching plan and literal confirmation before Git actions.
- Added a read-only plan lookup for unknown apply requests, removed absolute paths from lifecycle output, and fetches after a clean preflight even when tracking metadata is current.
- Reworked shell reconciliation to preflight every loader before writes and to recover already-written loaders if a later atomic write fails.
- Added lifecycle fixtures covering reviewed setup/update gates, stale remote state, invalid apply no-write behavior, output redaction, and loader preflight.

## Review fix round 2

- Reproduced an adoption filesystem failure that replaces a loader and then throws: the failed loader was left changed because recovery only tracked completed writes.
- Registered each pending loader for recovery before its atomic write and added an injected post-replace failure fixture that verifies all preflight contents are restored.
- RED: `bun test tests/integration/setup/setup-fixture.test.ts` produced 2 pass, 1 fail with the failed loader retaining rendered content.
- GREEN: the focused test produced 3 pass, 0 fail; `bun run build:ts` and `bun run validate` passed with 92 unit and 85 integration tests; `git diff --check` passed.
