# MZSH product decisions checkpoint

## Status

Design in progress

## Date

2026-08-27

## Purpose

This is durable architecture documentation. It records accepted product
direction and its remaining deliberate decisions. It is not a temporary
feature plan, an implementation handoff, or authorization to change behavior
without the corresponding design, security, and test work.

It complements the [documentation and safety portability design](documentation-and-safety-portability-design.md).
That document describes the approved documentation information architecture
and current managed-shell safety scope. This checkpoint records the broader
product direction that future architecture and implementation work must honor.

## Context

MZSH currently provides a local, receipt-backed managed Zsh topology. Its
adoption transaction, isolated preflight, rollback receipts, portable module
manifest, and safety shims establish a narrow ownership boundary. The intended
product expands that foundation into a global developer-tool workflow without
turning installation, inventory, or shell startup into an unbounded machine
manager.

The current checkout-local command flow remains the implemented and supported
reality until a reviewed global release path exists. The decisions below define
the future product boundary; they do not retroactively claim that unreleased
commands, artifacts, or services exist.

## Approved runtime and terminal foundation

- Bun and TypeScript are the approved system-of-record runtime and language for
  MZSH. The workload is primarily filesystem, process, network-bound update,
  and inventory work; retaining the audited TypeScript core avoids an otherwise
  unnecessary rewrite while preserving the existing Bun build and test flow.
- Bun's built-in API surface includes `bun:sqlite`, which supports the accepted
  local action-history boundary without introducing a separate runtime or
  database driver. See the [Bun API reference](https://bun.sh/docs/runtime/bun-apis).
- Bun has no selected LTS channel for this product. MZSH therefore uses exact,
  stable-GA Bun pins and compatibility gates rather than a floating runtime
  version or an implied LTS promise. Each pin change must verify the supported
  host target matrix before it becomes a release baseline.
- Compiled distribution artifacts are a later delivery concern. They may make
  global installation simpler, but they do not replace Bun and TypeScript as
  the system of record or create a second implementation path.
- React and `@opentui/react` are the approved full-screen UI foundation.
  React's component model is the chosen readability boundary for this product;
  Solid and Ink are not selected.
- Ink documents a Node-process runtime model and does not provide the adopted
  first-party leader/sequence dispatcher required by MZSH. OpenTUI is Bun-aligned
  and publishes `@opentui/react` with `@opentui/core` and `@opentui/keymap`; the
  latter is its shared command, keybinding, and sequence engine. See the
  [Ink project](https://github.com/vadimdemedes/ink) and the
  [OpenTUI project](https://github.com/anomalyco/opentui).
- `@opentui/core`, `@opentui/react`, and `@opentui/keymap` must use one exact
  coordinated version pin. A typed UI adapter isolates those dependencies from
  the domain, transaction, inventory, history, and redaction boundaries.
- The user interface is additive: it renders approved plans and results through
  existing safety contracts and must not create a second mutation or sensitive
  data path.
- Each coordinated package release must pass smoke gates for every supported
  release target before it becomes a baseline. The target matrix and exact pin
  remain release evidence, not a claim about universal terminal behavior.

## Accepted product decisions

### Setup, update, and distribution

- Setup update uses a safe, clean, fast-forward model. It must not discard
  local changes, silently merge divergent work, or overwrite unowned state.
- The intended installed lifecycle is global GitHub Bun installation followed
  by `mzsh setup`. Exact release-artifact mechanics remain an open decision.
- `setup` is idempotent and defaults to the current user's home directory. It
  plans first, reports its ownership boundary, and requires the applicable
  confirmation before mutation.
- Setup and update are one coherent lifecycle. The managed tool targets LTS or
  stable releases only; it does not silently switch users to experimental or
  pre-release channels.
- Update and remove operations require an explicit reviewed plan identifier
  and a mandatory confirmation. A successful-looking command name is never
  evidence that a mutation is authorized.
- Commits and pushes are permitted at reviewed milestones. Temporary completed
  planning artifacts are removed once their durable architecture, guide,
  reference, or decision content has an approved canonical home.

### Machine-manifest boundary

- A version-controlled machine manifest describes the complete public
  developer-tool and shell configuration boundary. It may declare supported
  tool intent, shell modules, categories, runtime links, and placeholders for
  private values.
- The manifest must contain no secret values. Private values remain outside
  version control and are resolved only through an explicitly private boundary.
- Personal application data, operating-system preference state, and project
  databases are out of scope. The manifest is not a general backup, migration,
  or workstation cloning format.
- Custom categories are versioned, nonsecret metadata. Their identity,
  display metadata, and supported inventory behavior are public contracts.
- Machine runtime links are versioned declarations of a boundary, not formula
  selection, package installation, network access, or arbitrary shell
  execution during startup.

### Inventory, categories, and history

- Inventory is observation-first. Providers report facts and metadata before
  any action planner offers a change; discovery does not imply ownership or
  authorization to mutate.
- A category registry supplies stable category identity and display metadata.
  Inventory providers remain independently testable and must not hard-code UI
  routing or mutation behavior.
- Action history uses Bun SQLite with a 30-day retention policy. History,
  snapshots, and associated state are owner-only; the product exposes history
  commands rather than requiring filesystem inspection.
- Stored history is operational evidence, not a secret store. It records the
  minimum redacted plan, result, and recovery metadata needed to explain a
  completed or failed action.

### Terminal interface and command contract

- The default interactive experience is a Neovim-like full-screen terminal
  interface. Space is the leader key, discoverable shortcuts remain visible,
  and editor resolution is explicit rather than inferred from a command shell.
- The terminal interface, command-line parser, help output, automation output,
  and confirmation screens share one command and help schema. Renderers do not
  independently define flags, action semantics, or safety checks.
- The product retains a secure environment list/get/set surface. Listing and
  display behavior is redacted by default; get/set guidance remains locked to
  the approved private-boundary contract and must not expose values in normal
  output, history, receipts, or diagnostics.

### Authentication and sensitive data

- An operating-system-handled, configurable 24-hour authentication lease is
  part of the product design. It is implemented last, after local planning,
  confirmation, mutation boundaries, recovery, and history are independently
  reliable.
- Lease acquisition is an external authorization boundary, not a replacement
  for local plan validation, receipts, confirmation, or rollback safety.
- Redaction uses name provenance and prefix matching compatible with the
  established ProxAI Gateway policy. The product does not disclose matched
  names, values, source lines, or private configuration while explaining a
  redaction decision.
- Locked environment get/set guidance must name the approved workflow without
  teaching value extraction, copying private content into the repository, or
  weakening owner-only storage requirements.

### Documentation, providers, and safety hardening

- The approved documentation information architecture and navigation model in
  the linked safety portability design remain authoritative: concise README,
  architecture explanations, goal-focused guides, exact reference, and
  numbered decisions with one canonical owner per fact.
- `.cursor` is removed only after repository-owned, provider-neutral guidance
  exists at the root `AGENTS.md` and in `.agents/`. Those guides describe MZSH
  safety, Bun commands, validation, private-boundary, and contribution rules
  without binding the project to one agent provider.
- Safety hardening stays within the approved managed loader, receipt,
  preflight, runtime-path, completion, and shim boundaries. Guardrails reduce
  known command risks; they are not a sandbox, authorization system, or a
  promise to contain arbitrary programs.
- The managed shell remains receipt-backed and loader-only. Installers and
  integrations may not append unmanaged startup mutations as an alternate
  ownership path.

## Non-goals

- Installing packages, selecting tool versions, or invoking a network client
  as a side effect of sourcing portable shell modules.
- Reading, copying, serializing, or displaying private values as part of
  inventory, manifests, history, diagnostics, documentation, or tests.
- Managing personal application data, operating-system preferences, project
  databases, arbitrary project files, or general workstation state.
- Treating command guards, a terminal UI, a confirmation prompt, or an auth
  lease as a substitute for ownership validation and reversible transactions.

## Open architecture decisions

These decisions are intentionally unresolved. They must be selected through a
reviewed architecture decision before implementation depends on them.

1. Command framework: choose the framework, if any, that serves the shared
   parser/router without duplicating command behavior. Commander and Citty are
   not approved by this checkpoint.
2. Global release artifact: define the exact GitHub-distributed artifact,
   provenance verification, install location, version discovery, clean
   fast-forward update rules, and recovery when the local installation changes.
3. Security-comment policy: decide whether narrowly scoped comments explaining
   security and rollback invariants remain permitted, or whether all rationale
   must live in architecture documents while code contains none.
4. Bun no-isolate concurrency rollout: complete a shared-state audit and set
   fixture, environment, module-registry, and database isolation rules before
   enabling concurrent no-isolate execution as a required gate.
5. Authentication provider mechanics: choose the operating-system integration,
   lease storage, renewal and expiry behavior, offline semantics, revocation,
   and the exact actions that require a valid lease.

## Consequences for future work

- Global distribution, the terminal interface, SQLite history, inventory, and
  authentication must compose existing plan/apply/rollback safety contracts;
  none may create an independent unreceipted mutation route.
- Machine-manifest planning must be separable from applying it, so every
  destructive-capable action can show a stable plan identifier and be retried
  or recovered from recorded owner-only state.
- The category registry and inventory providers are domain contracts. They
  should be introduced before renderer-specific menus or full-screen screens.
- Documentation migration must preserve the existing local-only forms until
  global release details and tests make new forms true. A future global command
  reference is not a reason to publish speculative installation instructions.
- Removing provider-specific guidance, temporary plans, or obsolete command
  paths is a compatibility migration with link, command, and safety checks;
  it is not a bulk deletion exercise.

## Review criteria

Future work is consistent with this checkpoint only if it demonstrates all of
the following:

- no secret or personal content crosses a public, persisted, or diagnostic
  boundary;
- every mutation has an owned target set, reviewed plan identifier, explicit
  confirmation, durable result, and defined recovery path;
- inventory remains observational until an authorized plan is applied;
- terminal and command-line surfaces present the same actions and help;
- shell startup remains deterministic, private-last, and free of package,
  network, or arbitrary executable configuration evaluation;
- history, snapshots, runtime links, receipts, and lease state remain
  owner-only; and
- docs distinguish implemented checkout-local behavior from future global
  distribution behavior.

## Self-review record

This checkpoint contains no credential material, personal paths, placeholder
tasks, or unapproved installation syntax. The future lifecycle name is an
accepted product decision; the global artifact and command framework remain
explicitly unresolved. It uses no fenced commands. Its links are relative
architecture navigation or primary upstream project references. The document is
a durable decision record and remains below the repository line limit.
