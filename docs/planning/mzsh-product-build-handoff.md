# MZSH product-build handoff

This is an active-build coordination record. It is temporary planning material and
must be removed when the integrated product, durable guides, and final audit are
complete.

[Previous: product decisions](../architecture/mzsh-product-decisions.md) ·
[Index: repository README](../../README.md) ·
[Next: safety and portability design](../architecture/documentation-and-safety-portability-design.md)

## Workspace and preservation boundary

- Active worktree: `/Users/onurseckinsenoglu/repos/mzsh-full-build`
- Active branch: `feat/mzsh-product-build`
- Base: local `main` documentation commits `f2c33c7` and `4a597a7`
- Remote: `origin` at `git@github.com:onurseckin/mzsh.git`; remote-ref check is required before push.
- The primary checkout has unrelated unstaged mode-only work in `.cursor/rules/`,
  the root entrypoint and manifest, `src/index.ts`, `src/interactiveMenu.ts`,
  `src/messages/`, and `tsconfig.json`. Preserve it without reset, checkout, or
  overwrite.

## Completed tasks

- Task 1 Toolchain and guidance: `51999b6`, `d968c32`. `bun run validate`,
  Lefthook pre-commit, and diff check passed. Approved after validation-gate
  repair.
- Task 2 Command catalog and Commander: `39c18f9`, `1f0560b`. Validation had
  46 unit and 76 integration tests plus Lefthook and diff check. Approved after
  parser and catalog-projection repair.
- Task 3 Reviewed plans and history: `a67aba0`, `1326612`, `23b092f`,
  `198a751`. Focused and full task validation is in the task report. Approved
  after retention, snapshot, plan-integrity, and rollback-race repairs.
- Task 4 Inventory and categories: `7ad0dbd`, `22440df`. Focused and full task
  validation is in the task report. Approved after closed safe-output projection
  repair.
- Task 5 Redaction, environment, and auth: `1943cad`, `7df27a2`, `b74d1d0`,
  `51fb8f2`, `f066c5e`. Validation had 78 unit and 82 integration tests plus
  Lefthook and diff check. Approved after production wiring, provenance,
  private-boundary, and bearer/OAuth repairs.
- Task 6 Safe setup and update: `4e3c1a7`, `d882312`, `14ecff0`, `55d93d5`.
  Validation had 92 unit and 87 integration tests; setup fixtures were 5/5;
  TypeScript build, Lefthook, and diff check passed. Approved after reviewed
  routing and persistent rollback-failure repairs.

Task-specific RED/GREEN evidence and review findings remain in the ignored
`.superpowers/sdd/mzsh-full-product-build/` ledger during the active build.
They are not durable product documentation and must be removed at completion.

## Active task

### Task 7 — catalog-driven OpenTUI adapter

Owner: `task_7_tui`. Scope is `src/tui/**`, `tests/unit/tui/**`, plus the
minimal Task 7 catalog, CLI, and TypeScript configuration integration specified
in the build plan.

RED checkpoint completed: `bun test tests/unit/tui/tui-adapter.test.ts`
`tests/unit/tui/action-bindings.test.ts` produced two expected missing-module
failures for `src/tui/types`. The test contract requires a typed view model,
catalog-derived Space-leader and Neovim-style actions, visible contextual
actions, and a visible but disabled destructive rollback action without an
eligible reviewed plan. The implementation must not introduce a second mutation
path; it renders confirmation state and delegates command handling through the
existing reviewed lifecycle boundary.

## Remaining execution order

1. Finish Task 7, run its focused RED/GREEN checks and full validation, commit,
   package, and independently review; repair any critical or important findings.
2. Execute Task 8 documentation: replace the old portability planning guide with
   concise Diátaxis-oriented architecture, guide, reference, and decisions
   pages; add navigation to every durable document; test links and
   catalog-derived command examples.
3. Execute Task 9 release gates: safety scans, package/version checks,
   source/test size checks, docs checks, unit and serial integration validation,
   and release-readiness evidence.
4. Run an independent final demand audit mapping every approved product
   requirement to code, tests, and durable documentation. Repair and re-audit
   any critical or important findings.
5. Run the fresh full final validation once, prepare a clean integration commit
   sequence, then remove this handoff and all temporary `.superpowers` planning
   artifacts.
6. Inspect remote state, push the validated feature branch, and merge to `main`
   only while preserving the primary checkout’s unrelated work. Never
   force-push, reset, or discard the preserved work.
7. Perform the authorized idempotent global MZSH setup only through the reviewed
   plan/confirmation workflow; record resulting non-secret status in the final
   report.

## Open findings and operating rules

- No unresolved Task 1–6 review finding remains.
- Task 7 is intentionally in its RED-to-GREEN implementation phase; it is the
  only active product-code writer at this checkpoint.
- The shared agent-thread limit can prevent otherwise-safe parallel
  documentation preparation. Do not interrupt the Task 7 owner; start the next
  lane as soon as a slot is free.
- SSH commit signing can fail because the local key passphrase is unavailable.
  Run hooks first, then use `git commit --no-gpg-sign` for the individual commit
  only; do not alter signing configuration.
- Never include secret values, local credentials, or personal environment values
  in output, history, tests, logs, or this record.

## Precise continuation instructions

1. Read this handoff, the ignored task plan, ledger, and the active task report before making ownership changes.
2. Check `git status --short --branch`; do not stage another worker’s files.
   Commit only the owned paths after verification.
3. After each task: generate its review package, use a separate Terra-high
   read-only reviewer, fix critical or important findings, and append the ledger
   only after approval.
4. Before final integration, inspect the primary checkout’s worktree and branch
   state again. If a merge would overlap preserved WIP, use a non-destructive
   isolated integration path or report the exact collision; do not move or
   discard the WIP.
5. Final delivery must state commits, remote push state, validation gates,
   global setup result, demand-audit verdict, and any genuine blockers.

[Previous: product decisions](../architecture/mzsh-product-decisions.md) ·
[Index: repository README](../../README.md) ·
[Next: safety and portability design](../architecture/documentation-and-safety-portability-design.md)
