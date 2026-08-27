import { join } from "node:path";
import type { AdoptionPlan, AdoptionPlanResult, AdoptionTarget, AdoptionTargetState } from "../domain/adoption";
import { PORTABLE_INTERACTIVE_MODULE_ORDER } from "../domain/portable-module-order";
import { NodeAdoptionFilesystem } from "../infrastructure/adoption-filesystem";

export interface PlanAdoptionInput {
  home: string;
  repository: string;
  config: string;
  legacySource?: string;
}

export interface PlanAdoptionDependencies {
  filesystem: NodeAdoptionFilesystem;
  id(): string;
  isSensitiveAssignment?(line: string): boolean;
}

function rejected(code: string, path: string): AdoptionPlanResult {
  return { kind: "rejected", code, path };
}

function isSafeSelectedAssignment(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^(?:(?:export|typeset(?:\s+-[A-Za-z]+)+)\s+)?[A-Za-z_][A-Za-z0-9_]*=/.test(trimmed) &&
    !/[`]|\$\(|\beval\b|\bsource\b|(^|\s)\.\s|[;|]|&&|\|\|/.test(trimmed)
  );
}

function sameState(left: AdoptionTargetState, right: AdoptionTargetState): boolean {
  return left.kind === right.kind && left.mode === right.mode && left.ownerId === right.ownerId && left.hash === right.hash && left.linkTarget === right.linkTarget;
}

function planAdoptionUnchecked(input: PlanAdoptionInput, dependencies: PlanAdoptionDependencies): AdoptionPlanResult {
  const filesystem = dependencies.filesystem;
  if (![input.home, input.repository, input.config].every((path) => filesystem.isAbsolute(path))) {
    return rejected("target-not-absolute", input.home);
  }
  if (!filesystem.hasSafeOwnedRoot(input.home)) return rejected("home-root-unsafe", input.home);
  if (!filesystem.hasSafeOwnedRoot(input.config)) return rejected("config-root-unsafe", input.config);
  if (!filesystem.hasSafeOwnedRoot(input.repository)) return rejected("repository-root-unsafe", input.repository);
  if (!filesystem.isContainedWithoutEscape(input.home, input.config)) return rejected("config-outside-home", input.config);
  if (input.legacySource !== undefined && !filesystem.isContainedWithoutEscape(input.home, input.legacySource)) {
    return rejected("legacy-source-outside-home", input.legacySource);
  }

  const entrypoint = join(input.repository, "portable", "zsh", "init.zsh");
  if (filesystem.describe(entrypoint).kind !== "file") return rejected("portable-entrypoint-missing", entrypoint);
  const managedRoot = join(input.config, "mzsh");
  const targets = [
    join(input.home, ".zshenv"),
    join(input.home, ".zprofile"),
    join(input.home, ".zshrc"),
    join(managedRoot, "private.zsh"),
    join(managedRoot, "shims"),
    join(managedRoot, "current"),
  ];
  if (input.legacySource !== undefined) targets.push(input.legacySource);
  if (new Set(targets).size !== targets.length) return rejected("legacy-source-overlaps-target", input.legacySource ?? input.home);
  const states = new Map<string, AdoptionTargetState>();
  for (const target of targets) {
    const expectedManagedLink = target.endsWith("/current")
      ? join(input.repository, "portable", "zsh")
      : target.endsWith("/shims")
        ? join(input.repository, "portable", "zsh", "shims")
        : undefined;
    const state = filesystem.describe(target);
    states.set(target, state);
    if (expectedManagedLink !== undefined) {
      if (state.kind === "absent") continue;
      if (state.kind === "symlink" && state.linkTarget === expectedManagedLink) continue;
      return rejected("managed-destination-unowned", target);
    }
    const root = target === input.legacySource || [join(input.home, ".zshenv"), join(input.home, ".zprofile"), join(input.home, ".zshrc")].includes(target)
      ? input.home
      : input.config;
    if (!filesystem.isContainedWithoutEscape(root, target)) return rejected("target-outside-root", target);
    if ([join(input.home, ".zshenv"), join(input.home, ".zprofile"), join(input.home, ".zshrc")].includes(target)) {
      if (state.kind !== "absent" && state.kind !== "file") return rejected("loader-destination-unsafe", target);
      if (
        state.kind === "file" &&
        (state.ownerId === undefined || filesystem.currentUserId() === undefined || state.ownerId !== filesystem.currentUserId())
      ) {
        return rejected("loader-destination-unowned", target);
      }
    }
  }

  const privatePath = join(managedRoot, "private.zsh");
  const privateBefore = states.get(privatePath);
  if (privateBefore === undefined) return rejected("metadata-unavailable", privatePath);
  if (privateBefore.kind === "symlink" || privateBefore.kind === "other" || privateBefore.kind === "directory") {
    return rejected("private-destination-unsafe", privatePath);
  }
  if (privateBefore.kind === "file" && ((privateBefore.mode ?? 0) & 0o077) !== 0) {
    return rejected("private-destination-insecure", privatePath);
  }
  if (
    privateBefore.kind === "file" &&
    (privateBefore.ownerId === undefined || filesystem.currentUserId() === undefined || privateBefore.ownerId !== filesystem.currentUserId())
  ) {
    return rejected("private-destination-foreign-owner", privatePath);
  }

  let privateMigration: AdoptionPlan["privateMigration"];
  if (input.legacySource !== undefined) {
    const source = states.get(input.legacySource);
    if (source?.kind !== "file" || source.hash === undefined) return rejected("legacy-source-invalid", input.legacySource);
    let snapshot;
    try {
      snapshot = filesystem.readRegularUtf8NoFollow(input.legacySource);
    } catch {
      return rejected("legacy-source-invalid", input.legacySource);
    }
    if (!sameState(source, snapshot.state)) return rejected("source-changed", input.legacySource);
    const lines = snapshot.text.split(/(?<=\n)/);
    const selectedLineIndexes = lines.flatMap((line, index) => dependencies.isSensitiveAssignment?.(line) === true ? [index] : []);
    if (selectedLineIndexes.some((index) => !isSafeSelectedAssignment(lines[index] ?? ""))) {
      return rejected("legacy-selected-unsafe", input.legacySource);
    }
    privateMigration = { sourcePath: input.legacySource, sourceHash: source.hash, selectedLineIndexes };
  }

  let packageVersion = "unknown";
  let packageHash: string;
  let entrypointHash: string;
  try {
    const packagePath = join(input.repository, "package.json");
    const metadata: unknown = JSON.parse(filesystem.read(packagePath));
    if (typeof metadata !== "object" || metadata === null || (metadata as { name?: unknown }).name !== "mzsh") {
      return rejected("repository-identity-invalid", input.repository);
    }
    if (typeof metadata === "object" && metadata !== null && "version" in metadata) {
      const version = (metadata as { version?: unknown }).version;
      if (typeof version === "string") packageVersion = version;
    }
    packageHash = filesystem.hash(packagePath);
    entrypointHash = filesystem.hash(entrypoint);
  } catch {
    return rejected("repository-metadata-invalid", input.repository);
  }

  const categories = ["loader", "loader", "loader", "private", "shims", "current"] as const;
  const targetObjects: AdoptionTarget[] = targets.map((path, index) => ({
    category: index < 3 ? "loader" : path === privatePath ? "private" : path === input.legacySource ? "legacy" : path.endsWith("shims") ? "shims" : "current",
    path,
    before: states.get(path)!,
  }));
  const id = dependencies.id();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return rejected("transaction-id-invalid", input.config);
  const stateDirectory = join(managedRoot, "state", id);
  if (filesystem.describe(stateDirectory).kind !== "absent" || filesystem.describe(join(stateDirectory, "receipt.json")).kind !== "absent") {
    return rejected("transaction-state-exists", stateDirectory);
  }
  const plan: AdoptionPlan = {
    schema: "mzsh.adoption-plan/v1",
    id,
    home: input.home,
    repository: input.repository,
    config: input.config,
    stateDirectory,
    backupDirectory: join(stateDirectory, "backups"),
    privatePath,
    currentLink: join(managedRoot, "current"),
    shimLink: join(managedRoot, "shims"),
    entrypoint,
    repositoryPreconditions: { entrypointHash, packageHash },
    moduleOrder: PORTABLE_INTERACTIVE_MODULE_ORDER,
    targets: targetObjects,
    mutations: [
      { category: categories[0], path: targets[0]!, kind: "file" },
      { category: categories[1], path: targets[1]!, kind: "file" },
      { category: categories[2], path: targets[2]!, kind: "file" },
      { category: "private", path: privatePath, kind: "file" },
      ...(privateMigration?.selectedLineIndexes.length ? [{ category: "legacy" as const, path: input.legacySource!, kind: "file" as const }] : []),
      { category: "shims", path: join(managedRoot, "shims"), kind: "symlink", linkTarget: join(input.repository, "portable", "zsh", "shims") },
      { category: "current", path: join(managedRoot, "current"), kind: "symlink", linkTarget: join(input.repository, "portable", "zsh") },
    ],
    repositoryMetadata: { version: packageVersion, commit: null },
    ...(privateMigration === undefined ? {} : { privateMigration }),
  };

  if (!targetObjects.every((target) => sameState(target.before, filesystem.describe(target.path)))) {
    return rejected("source-changed", input.home);
  }
  return { kind: "ready", plan };
}

export function planAdoption(input: PlanAdoptionInput, dependencies: PlanAdoptionDependencies): AdoptionPlanResult {
  try {
    return planAdoptionUnchecked(input, dependencies);
  } catch {
    return { kind: "rejected", code: "metadata-unavailable", path: input.home };
  }
}
