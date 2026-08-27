# Documentation and safety portability design

## Status and scope

Status: approved design for a documentation-only implementation lane; see the [product decisions checkpoint](mzsh-product-decisions.md) for durable broader product direction.

This specification defines the repository documentation structure and the
documentation contracts for MZSH's managed shell, adoption transaction, and
safety shims. It does not authorize changes to shell behavior, command policy,
host configuration, dependencies, or package lifecycle behavior.

## Context and current evidence

MZSH is a local-only, receipt-backed Zsh adoption tool. The public lifecycle is
`audit`, `bootstrap`, `update`, and `rollback`; mutation is opt-in through
`--apply`. The parser enforces absolute sources and a constrained receipt ID,
and retired lifecycle flags return fixed migration guidance.

The current repository documents this behavior in four overlapping places:

- The repository README combines onboarding, command recipes, architecture,
  caveats, and development commands.
- `docs/planning/mzsh-portability/README.md` is active operator guidance even
  though its location suggests temporary planning material.
- `portable/zsh/README.md` is the implementation-adjacent reference for shell
  loaders, exact module order, variables, completions, and private loading.
- `docs/decisions/001-managed-dotfiles.md` records the managed reversible
  topology decision and establishes the numbered ADR convention.

The stable boundaries are: CLI parsing/composition with dry-run defaults;
validated adoption, backups, receipt publication, and failure restoration;
isolated preflight in a generated home; deterministic all-shell/login/
interactive loaders with private-last loading; and a shim tree registered first
in PATH before narrow destructive-operation checks.

## Documentation principles

### Ecosystem standards

- Use Diátaxis: tutorials teach, guides solve a goal, reference states exact
  contracts, and explanations state why boundaries exist.
- Use numbered ADRs under `docs/decisions/`; preserve accepted decisions.
- Keep examples checkout-local: `bun run mzsh --`, never an assumed global executable.

### Current repository reality

- `portable/zsh/README.md` is closest to literal module and variable contracts;
  README already has the tested checkout-local entrypoint and quality commands.
- The no-command menu is a managed-file/legacy-context opening surface, not an
  adoption path. `docs/planning/` is for future plans, not operator material.

### Documentation judgment calls

- Give each fact one canonical owner and link rather than duplicate tables.
- Retain the portable README as code-adjacent reference; do not copy its module list.
- Describe Java as discovery and runtime paths as operator-selected data, never
  formula or version-selection instructions.

## Audiences and Diátaxis ownership

| Audience          | Need                                                         | Diátaxis material                                         |
| ----------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| New operator      | Safely adopt a checkout on a new machine                     | Tutorial: new-machine flow                                |
| Existing operator | Audit, update, recover, or configure one concern             | How-to guides                                             |
| Automation author | Exact commands, flags, exit behavior, and output             | CLI and receipt reference                                 |
| Shell maintainer  | Understand loader boundaries, order, and PATH policy         | Architecture explanation plus portable reference          |
| Security reviewer | Verify threat boundaries and recovery behavior               | Architecture explanation, ADR, and safety-shim reference  |
| Contributor       | Change documentation or code without contradicting contracts | Architecture, reference, ADR index, and quality reference |

## Target documentation tree

```text
README.md

docs/
  architecture/
    README.md
    documentation-and-safety-portability-design.md
    managed-shell-topology.md
    adoption-transactions.md
    cli-and-discovery.md
    safety-shims.md

  guide/
    README.md
    new-machine.md
    audit-and-read-findings.md
    bootstrap-existing-zsh.md
    update-a-checkout.md
    rollback-and-recovery.md
    configure-private-and-runtime-paths.md
    configure-completions-and-fzf.md

  reference/
    cli.md
    audit-findings.md
    managed-files-and-receipts.md
    development-quality.md

  decisions/
    README.md
    001-managed-dotfiles.md

  planning/
    # Future implementation plans only.

portable/zsh/
  README.md
```

### Canonical ownership and disposition

| Current material                           | Disposition            | Canonical replacement or role                                                        |
| ------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------ |
| `README.md`                                | Rewrite and retain     | Landing page, precise quick start, basic commands, safety summary, links             |
| `docs/planning/mzsh-portability/README.md` | Decompose, then remove | Guide and architecture pages listed above                                            |
| `portable/zsh/README.md`                   | Retain and narrow      | Exact loader, module, variable, completion, FZF, and runtime data-boundary reference |
| `docs/decisions/001-managed-dotfiles.md`   | Retain unchanged       | Accepted decision rationale                                                          |
| `docs/decisions/README.md`                 | Add                    | ADR index with status and scope                                                      |

The old portability guide must remain until all internal links target its
replacements. The removal commit must not leave a redirect-like duplicate that
can become a second source of truth.

## README contract

The README is a short landing page for evaluators, operators, and contributors.
It owns no detailed flag grammar, module list, receipt schema, or caveat table.

It contains five sections: purpose; quick start; one-line basic commands;
compact safety model; and links to guide, architecture, portable reference,
ADRs, and development quality. It owns no detailed grammar, module list,
receipt schema, or caveat table.

The README tells the operator to clone the reviewed MZSH repository as `mzsh`,
then uses this authoritative checkout-local sequence:

```sh
cd mzsh
bun install

bun run mzsh -- audit
bun run mzsh -- bootstrap --source "$PWD"
bun run mzsh -- bootstrap --source "$PWD" --apply
```

The basic daily commands are:

```sh
bun run mzsh -- audit
bun run mzsh -- update --source "$PWD"
bun run mzsh -- update --source "$PWD" --apply
bun run mzsh -- rollback receipt-id
bun run mzsh -- rollback receipt-id --apply
```

`$PWD` expands to an absolute checkout path in normal shells. Documentation
must state that both bootstrap and update plan before applying, and rollback
must be dry-run reviewed before `--apply`.

## Guide contracts

`docs/guide/README.md` is a goal-oriented index, not a second command
reference. Each guide starts with prerequisites, gives one safe outcome, states
when `--apply` is needed, and links to the exact CLI reference.

| Guide                                    | Goal and required coverage                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `new-machine.md`                         | Tutorial from reviewed clone through first receipt and opening a fresh shell                                  |
| `audit-and-read-findings.md`             | Read human and JSON audit output; distinguish information, warning, and error findings                        |
| `bootstrap-existing-zsh.md`              | Dry-run a legacy-source adoption, inspect selected-assignment count, apply an accepted plan                   |
| `update-a-checkout.md`                   | Update a checkout through normal source control outside MZSH, then plan/apply local adoption                  |
| `rollback-and-recovery.md`               | Locate receipt ID, inspect dry rollback, handle conflict, apply rollback, and retain backups correctly        |
| `configure-private-and-runtime-paths.md` | Create safe private state and owner-only data-only runtime directory entries without source/eval instructions |
| `configure-completions-and-fzf.md`       | Configure existing completion locations and opt-in static FZF files without generated-shell evaluation        |

## Reference contracts

`docs/reference/cli.md` owns command grammar, output modes, exit codes, and
retired route behavior. Its syntax must match the parser exactly:

```text
bun run mzsh -- audit [--source /absolute/checkout] [--json]
bun run mzsh -- bootstrap --source /absolute/checkout [--legacy-source /absolute/file] [--apply]
bun run mzsh -- update [--source /absolute/checkout] [--apply]
bun run mzsh -- rollback receipt-id [--apply]
```

The reference also states that unknown, duplicate, misplaced, relative, and
traversal-shaped arguments are rejected; retired `--update`, `--reinstall`, and
`--uninst` return migration guidance without lifecycle mutation.

`audit-findings.md` owns code, severity, remediation class, and informational
status without local diagnostics, private material, or host-specific paths.
`managed-files-and-receipts.md` owns loaders, managed links, receipt/backup
lifecycle, and rollback availability without machine-specific receipt content.
`development-quality.md` owns:

```sh
mise exec -- bun run quality:check
bun run build:ts
bun test
```

## Architecture explanations

`managed-shell-topology.md` explains loader contexts, login-only path behavior,
module order, one pre-framework PATH finalization, completion ownership, and
private-last loading. Its post-private invariant is shim-first effective PATH
with no duplicate shim entry; this forbids a second finalize hook or appended
installer PATH tail and requires guarded adoption for repair.

`adoption-transactions.md` covers preconditions, isolated preflight, atomic
writes/journal, receipt/backups, rollback validation/compensation, and the
distinction between repository planning provenance and backup recovery.
`cli-and-discovery.md` covers managed routing before legacy parsing and the
ordered discovery-only menu. `safety-shims.md` covers the narrow guard,
delegation, fake-only tests, and its non-sandbox limitation.

## Safety threat model and non-goals

### Protected properties

- Documents, plans, receipts, audit results, fixtures, and diagnostics contain
  no private assignment names or values.
- Private state is a local current-user-owned regular file without group/other
  permissions; runtime entries are data-only directory symlinks below a safe
  runtime root and are never read, evaluated, formula-selected, or version-selected.
- Mutation requires `--apply` after isolated preflight; rollback validates its
  protected receipt/backups and does not require the repository checkout.

### Non-goals

- MZSH is not a sandbox, package installer/remover, version manager,
  source-control client, or Docker controller.
- Shims cannot protect absolute-path or bypassed invocations, another shell,
  external aliases, elevated processes, or a compromised account.
- It does not infer arbitrary intent or make destructive commands safe; Git,
  Docker, package removal, and chmod guard families are explicitly out of scope.

## Authoritative managed shim link and receipt compatibility

The adoption plan owns a shim link at the managed configuration root. Its
target is the repository's `portable/zsh/shims` tree, alongside the managed
`current` link to `portable/zsh`. The receipt records the shim target's applied
state under the `shims` mutation category and includes the canonical interactive
module order and mutation order.

Compatibility: plan accepts only absent or exact managed shim targets; receipt
requires three loaders, private, optional legacy, shims, and current; rollback
validates applied state and restores current last. Docs may name the category
and repository-relative target but never instruct manual link/receipt editing.

## Managed shim command policy

The authoritative managed shim command set contains exactly 12 same-named
links:

```text
bun  bunx  dd  diskutil  find  npm  npx  pnpm  prisma  rm  rsync  yarn
```

Each link points to `shim-runner`. `check-prohibited` is the policy helper, not
a user-facing shim command. Commands outside this set are not guarded by this
layer.

The current protected behaviors are intentionally narrow:

| Family               | Refused operation                                                                   |
| -------------------- | ----------------------------------------------------------------------------------- |
| Package-runner forms | `prisma db push`, including managed package-runner forms                            |
| `rm`                 | Recursive removal targeting normalized `/`, `/Users`, or `$HOME`                    |
| `rsync`              | `--delete` when the final non-option destination is a protected root                |
| `find`               | `-delete` from a protected root                                                     |
| `diskutil`           | Destructive disk erase, repartition, zero, random, secure erase, or partition verbs |
| `dd`                 | Output targeting `/dev/diskN` or `/dev/rdiskN`                                      |

Refusal output is fixed and redacted. It identifies the safe migration/targeted
command category without echoing user arguments, normalized targets, paths, or
values. A refusal exits 64. The documentation must never present a blocked form
as a supported recovery procedure.

### Runner delegation and recursion rules

For an invocation not refused by the policy helper, `shim-runner` must:

1. Canonicalize its own directory without evaluating shell text.
2. Remove every lexical and canonical occurrence of that directory from PATH.
3. Resolve the same command name using the filtered PATH.
4. Reject a missing result or a result resolving back to the shim directory
   with exit status 127.
5. `exec` the resolved program with the original argv unchanged.

No `eval`, string-built command, shell interpolation of argv, or fallback to a
shim path is permitted. Test delegation uses isolated fake executables only;
it must never exercise a real destructive command.

## Bootstrap, preflight, and audit integration

Audit is read-only redacted metadata/findings for path, ownership, topology,
private state, Node/pnpm/Java, and probes. Bootstrap/update share local
plan/apply: dry output has safe target state, order, receipt path, repository
preconditions, module order, and sensitive count; only `--apply` mutates.
Preflight renders loaders in a generated home with isolated HOME, ZDOTDIR, XDG,
and minimal PATH, syntax-checks all portable/rendered files, then starts each
loader with fixed arguments. It writes neither receipt nor plan state on failure.
Rollback accepts only a contained receipt ID; dry run writes nothing, apply
restores originals and marks unavailable only after success, otherwise compensates.

## New-machine and recovery documentation flow

Tutorial: clone reviewed checkout; install dependencies; audit; inspect absolute
bootstrap dry run; apply an accepted plan and record receipt ID; use update only
after external source-control work; inspect rollback dry run before apply.

The recovery guide distinguishes these outcomes:

| Outcome                      | Operator action                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Planning rejection           | Read the stable rejection code and repair the local prerequisite; do not force a write                       |
| Preflight failure            | Repair portable syntax or isolated-startup condition, then create a fresh plan                               |
| Apply failure                | Preserve managed state/backups, inspect the fixed result, and retry only after the cause is repaired         |
| Rollback conflict            | Do not overwrite changed targets; inspect the conflict and choose an explicit recovery path                  |
| Receipt invalid              | Restore owner-only state/backup safety or use retained protected evidence; do not edit receipt JSON manually |
| Missing optional integration | Configure it outside MZSH or leave it absent; startup remains quiet and functional                           |

## Test matrix and fake-only safety policy

| Area                   | Required regression evidence                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Documentation commands | Checkout-local invocation and no-bare-command scan; parser accepts every documented form                                 |
| README links           | Relative-link check and no duplicate canonical command table                                                             |
| CLI grammar            | Duplicate, unknown, misplaced, relative, traversal, dry-run, and apply cases                                             |
| Audit                  | JSON/human redaction, safe pnpm runtime entry, Java information distinction, probe-failure redaction                     |
| Adoption               | Root/target safety, preflight-before-write, atomic failure recovery, receipt publication, no secret serialization        |
| Rollback               | Receipt/backup validation, conflict dry run, compensation, repository-unavailable rollback                               |
| Portable shell         | Canonical order, login/interactive boundary, one completion owner, private-last rollback/retry, shim-first/no-duplicates |
| Shim policy            | Exact 12-link topology, fake-only allowed delegation with exact argv, each refusal family, recursion and 127 absence     |

No test may invoke a real destructive command, copy local private content, rely
on a personal home path, or assert a credential assignment name or value.

## Migration and backward compatibility

- Existing stable loaders remain the only supported profile entrypoints.
- Existing source-all configuration is discovered and labelled as legacy
  migration context; it is not auto-sourced or implicitly rewritten.
- Retired lifecycle scripts and flags continue to return fixed checkout-local
  migration guidance without performing unlink, reinstall, uninstall, fetch,
  or package operations.
- The no-command menu remains available for safe file discovery/opening. Managed
  files precede legacy context, and opening a file does not apply a transaction.
- Existing receipts retain their schema and module-order compatibility rules;
  new documentation must describe compatibility rather than alter it.

## Commit and push milestones

1. `docs: add documentation architecture` adds the new tree, ADR index, and
   canonical documents while retaining the old portability guide so links stay
   valid.
2. `docs: clarify managed safety and recovery` rewrites the README and adds
   guide/reference/architecture content, including the shim policy and
   checkout-local examples.
3. `test: verify managed documentation commands` adds focused command-form and
   link checks, updates links, and removes the old planning guide only after no
   internal references remain.

Run focused documentation tests after each milestone. Before publishing the
last milestone, run quality, TypeScript build, the complete test suite, a
Markdown-link check, a bare-command scan, a secret/personal-path diff scan, and
`git diff --check`. Push only the reviewed final documentation graph; do not
publish an intermediate graph with broken links or two canonical guides.

## Acceptance criteria

- The README offers only checkout-local quick-start and basic lifecycle forms.
- Each subject has one canonical owner in the target tree, with links instead
  of duplicated command grammar, caveat tables, or module lists.
- The old portability document is gone only after replacement links and tests
  are present; `docs/planning` contains plans only.
- Architecture pages explain the implementation's managed/legacy, loader,
  preflight, transaction, receipt, PATH, completion, and shim boundaries.
- Guide pages provide safe, goal-specific steps and identify `--apply` as the
  only mutation opt-in.
- Reference pages exactly match parser and receipt behavior, redact sensitive
  material, and identify retired routes.
- The shim page names the exact 12-command set, every current protected family,
  recursion/argv/127 behavior, and the non-sandbox limitation.
- No documentation contains credentials, personal filesystem paths, a global
  actionable managed command, unsafe manual loader edits, or package/network
  lifecycle instructions attributed to MZSH.
- The documentation checks and existing quality/build/test gates pass before
  the documentation implementation is considered ready for review.

## Self-review record

This specification has no unresolved decisions, personal paths, or credential
material. Forms are checkout-local; ownership is explicit; the shim policy does
not broaden the guard surface.
