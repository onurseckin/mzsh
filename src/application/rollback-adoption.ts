import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { AdoptionReceipt, AdoptionReceiptTarget, AdoptionRollbackResult, AdoptionTargetKind, AdoptionTargetState } from "../domain/adoption";
import { NodeAdoptionFilesystem } from "../infrastructure/adoption-filesystem";

export interface RollbackAdoptionInput {
  receiptPath: string;
  dryRun: boolean;
}

export interface RollbackAdoptionDependencies {
  filesystem: NodeAdoptionFilesystem;
}

const targetKinds: readonly AdoptionTargetKind[] = ["absent", "file", "symlink", "directory", "other"];
const categories = ["loader", "private", "legacy", "shims", "current"] as const;
const portableModuleOrder = ["observability", "path", "homebrew", "bun", "nvm", "rust", "android", "private", "completion-directories", "oh-my-zsh", "completion"];

function sameState(left: AdoptionTargetState, right: AdoptionTargetState): boolean {
  return left.kind === right.kind && left.mode === right.mode && left.ownerId === right.ownerId && left.hash === right.hash && left.linkTarget === right.linkTarget;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isState(value: unknown): value is AdoptionTargetState {
  if (!isRecord(value) || typeof value.path !== "string" || !targetKinds.includes(value.kind as AdoptionTargetKind)) return false;
  if (value.mode !== undefined && (typeof value.mode !== "number" || !Number.isInteger(value.mode))) return false;
  if (value.ownerId !== undefined && (typeof value.ownerId !== "number" || !Number.isInteger(value.ownerId))) return false;
  if (value.hash !== undefined && (typeof value.hash !== "string" || !/^[a-f0-9]{64}$/.test(value.hash))) return false;
  return value.linkTarget === undefined || typeof value.linkTarget === "string";
}

function isTarget(value: unknown): value is AdoptionReceiptTarget {
  return (
    isRecord(value) &&
    typeof value.category === "string" &&
    categories.includes(value.category as (typeof categories)[number]) &&
    isState(value.original) &&
    isState(value.applied) &&
    value.original.path === value.applied.path &&
    (value.backupRelativePath === undefined || typeof value.backupRelativePath === "string")
  );
}

function isReceipt(value: unknown): value is AdoptionReceipt {
  return (
    isRecord(value) &&
    value.schema === "mzsh.adoption-receipt/v1" &&
    value.status === "applied" &&
    typeof value.id === "string" &&
    typeof value.home === "string" &&
    typeof value.config === "string" &&
    typeof value.stateDirectory === "string" &&
    isRecord(value.repository) &&
    typeof value.repository.root === "string" &&
    typeof value.repository.version === "string" &&
    (value.repository.commit === null || typeof value.repository.commit === "string") &&
    Array.isArray(value.moduleOrder) &&
    value.moduleOrder.every((item) => typeof item === "string") &&
    Array.isArray(value.pathOrder) &&
    value.pathOrder.every((item) => typeof item === "string" && categories.includes(item as (typeof categories)[number])) &&
    isRecord(value.preflight) &&
    value.preflight.kind === "passed" &&
    Array.isArray(value.targets) &&
    value.targets.every(isTarget)
  );
}

function isSafeBackupPath(stateDirectory: string, backupRelativePath: string, filesystem: NodeAdoptionFilesystem): boolean {
  if (isAbsolute(backupRelativePath) || backupRelativePath.split(/[\\/]/).includes("..")) return false;
  return filesystem.isContainedWithoutEscape(stateDirectory, resolve(stateDirectory, backupRelativePath));
}

function validateReceipt(receipt: AdoptionReceipt, receiptPath: string, filesystem: NodeAdoptionFilesystem): boolean {
  if (![receipt.home, receipt.config, receipt.stateDirectory].every((path) => isAbsolute(path))) return false;
  if (!filesystem.hasSafeOwnedRoot(receipt.home) || !filesystem.hasSafeOwnedRoot(receipt.config) || !filesystem.hasSafeOwnedRoot(receipt.stateDirectory)) return false;
  if (!filesystem.isContainedWithoutEscape(receipt.home, receipt.config)) return false;
  if (!filesystem.isContainedWithoutEscape(receipt.config, receipt.stateDirectory)) return false;
  if (resolve(receiptPath) !== resolve(receipt.stateDirectory, "receipt.json")) return false;
  const receiptState = filesystem.describe(receiptPath);
  if (receiptState.kind !== "file" || receiptState.mode !== 0o600 || receiptState.ownerId === undefined || filesystem.currentUserId() === undefined || receiptState.ownerId !== filesystem.currentUserId()) return false;
  const expectedPathOrder = [
    "loader",
    "loader",
    "loader",
    "private",
    ...(receipt.targets.some((target) => target.category === "legacy") ? ["legacy"] : []),
    "shims",
    "current",
  ];
  if (receipt.moduleOrder.join(",") !== portableModuleOrder.join(",") || receipt.pathOrder.join(",") !== expectedPathOrder.join(",")) return false;
  const required = new Set(["private", "shims", "current"]);
  const loaderPaths = new Set([join(receipt.home, ".zshenv"), join(receipt.home, ".zprofile"), join(receipt.home, ".zshrc")]);
  for (const target of receipt.targets) {
    if (target.category === "loader") loaderPaths.delete(target.original.path);
    else if (target.category !== "legacy") required.delete(target.category);
  }
  if (loaderPaths.size !== 0 || required.size !== 0 || receipt.targets.filter((target) => target.category === "legacy").length > 1) return false;
  const seenCategories = new Set<string>();
  return receipt.targets.every((target) => {
    if (seenCategories.has(`${target.category}:${target.original.path}`)) return false;
    seenCategories.add(`${target.category}:${target.original.path}`);
    const root = target.category === "loader" || target.category === "legacy" ? receipt.home : receipt.config;
    const targetRelative = relative(resolve(root), resolve(target.original.path));
    const expectedPath =
      target.category === "private"
        ? join(receipt.config, "mzsh", "private.zsh")
        : target.category === "shims"
          ? join(receipt.config, "mzsh", "shims")
          : target.category === "current"
            ? join(receipt.config, "mzsh", "current")
            : undefined;
    const validLoader = [join(receipt.home, ".zshenv"), join(receipt.home, ".zprofile"), join(receipt.home, ".zshrc")].includes(
      target.original.path
    );
    if ((target.category === "loader" && !validLoader) || (expectedPath !== undefined && target.original.path !== expectedPath)) return false;
    if (
      (target.category === "loader" || target.category === "private" || target.category === "legacy") &&
      target.applied.kind !== "file"
    ) return false;
    if ((target.category === "shims" || target.category === "current") && target.applied.kind !== "symlink") return false;
    const backupValid = (() => {
      if (target.original.kind !== "file") return target.backupRelativePath === undefined;
      if (target.backupRelativePath === undefined || target.original.hash === undefined) return false;
      if (!isSafeBackupPath(receipt.stateDirectory, target.backupRelativePath, filesystem)) return false;
      const backup = join(receipt.stateDirectory, target.backupRelativePath);
      if (!filesystem.hasSafeOwnedRoot(dirname(backup))) return false;
      const state = filesystem.describe(backup);
      return state.kind === "file" && state.mode === 0o600 && state.ownerId !== undefined && filesystem.currentUserId() !== undefined && state.ownerId === filesystem.currentUserId() && state.hash === target.original.hash;
    })();
    return (
      !targetRelative.startsWith("..") &&
      !isAbsolute(targetRelative) &&
      filesystem.isContainedWithoutEscape(root, dirname(target.original.path)) &&
      backupValid
    );
  });
}

function parseReceipt(filesystem: NodeAdoptionFilesystem, receiptPath: string): AdoptionReceipt | undefined {
  try {
    const value: unknown = JSON.parse(filesystem.read(receiptPath));
    return isReceipt(value) && validateReceipt(value, receiptPath, filesystem) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function rollbackAdoption(input: RollbackAdoptionInput, dependencies: RollbackAdoptionDependencies): AdoptionRollbackResult {
  const filesystem = dependencies.filesystem;
  const receipt = parseReceipt(filesystem, input.receiptPath);
  if (receipt === undefined) return { kind: "failed", code: "receipt-invalid", path: input.receiptPath };

  let conflicts: string[];
  try {
    conflicts = receipt.targets
      .filter((target) => !sameState(target.applied, filesystem.describe(target.applied.path)))
      .map((target) => target.applied.path);
  } catch {
    return { kind: "failed", code: "metadata-unavailable", path: input.receiptPath };
  }
  if (conflicts.length > 0) return { kind: "conflict", paths: conflicts };

  const paths = receipt.targets.map((target) => target.original.path);
  if (input.dryRun) return { kind: "ready", dryRun: true, paths };

  const rollbackDirectory = join(receipt.stateDirectory, "rollback-journal");
  const appliedBackups = new Map<string, string>();
  const journal: AdoptionReceiptTarget[] = [];
  const appliedReceipt = filesystem.read(input.receiptPath);
  try {
    filesystem.ensureDirectory(rollbackDirectory, 0o700, true);
    for (const [index, target] of receipt.targets.entries()) {
      if (target.applied.kind === "file") {
        const backup = join(rollbackDirectory, `${index}-${basename(target.applied.path)}`);
        filesystem.backup(target.applied, backup);
        appliedBackups.set(target.applied.path, backup);
      }
    }
    for (const target of [...receipt.targets].reverse()) {
      journal.push(target);
      restoreOriginal(filesystem, receipt, target);
    }
    filesystem.writeAtomic(input.receiptPath, JSON.stringify({ ...receipt, status: "unavailable" }), 0o600);
    return { kind: "rolled-back", paths };
  } catch {
    let compensationFailed = false;
    for (const target of [...journal.filter((target) => target.category !== "current"), ...journal.filter((target) => target.category === "current")]) {
      try {
        filesystem.restore(target.applied, appliedBackups.get(target.applied.path));
      } catch {
        compensationFailed = true;
      }
    }
    try {
      filesystem.writeAtomic(input.receiptPath, appliedReceipt, 0o600);
    } catch {
      compensationFailed = true;
    }
    return { kind: "failed", code: compensationFailed ? "rollback-compensation-failed" : "rollback-failed", path: input.receiptPath };
  }
}

function restoreOriginal(filesystem: NodeAdoptionFilesystem, receipt: AdoptionReceipt, target: AdoptionReceiptTarget): void {
  const backupPath = target.backupRelativePath === undefined ? undefined : join(receipt.stateDirectory, target.backupRelativePath);
  filesystem.restore(target.original, backupPath);
}
