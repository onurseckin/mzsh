import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { applyAdoption } from "../application/apply-adoption";
import { auditEnvironment } from "../application/audit-environment";
import { planAdoption } from "../application/plan-adoption";
import { rollbackAdoption } from "../application/rollback-adoption";
import { classifySensitiveAssignment } from "../application/sensitive-assignment-policy";
import type { AdoptionPlan, AdoptionApplyResult, AdoptionRollbackResult } from "../domain/adoption";
import type { EnvironmentSnapshot } from "../domain/audit";
import { NodeAdoptionFilesystem } from "../infrastructure/adoption-filesystem";
import { EnvironmentProbes } from "../infrastructure/environment-probes";
import { ZshPreflight } from "../infrastructure/zsh-preflight";
import { parseArguments } from "./parse-arguments";

type Preflight = { preflight(plan: AdoptionPlan): { kind: "passed" } | { kind: "failed"; code: "syntax-invalid" | "isolated-startup-failed" } };
type Probes = { collect(options: { home: string; xdgConfig: string; xdgCache: string; repositoryRoot: string }): EnvironmentSnapshot };

export interface RunMzshCliDependencies {
  home: string;
  xdgConfig: string;
  xdgCache: string;
  repositoryRoot: string;
  write(message: string): void;
  filesystem?: NodeAdoptionFilesystem;
  probes?: Probes;
  preflight?: Preflight;
  id?: () => string;
  apply?: typeof applyAdoption;
  rollback?: typeof rollbackAdoption;
}

function isSuccess(result: AdoptionApplyResult | AdoptionRollbackResult): boolean {
  return result.kind === "applied" || result.kind === "rolled-back" || result.kind === "ready";
}

function planSummary(plan: AdoptionPlan): object {
  return {
    schema: plan.schema,
    id: plan.id,
    targets: plan.targets.map((target) => ({ path: target.path, kind: target.before.kind, mode: target.before.mode, hash: target.before.hash, linkTarget: target.before.linkTarget })),
    mutations: plan.mutations.map((mutation) => ({ category: mutation.category, path: mutation.path, kind: mutation.kind, ...(mutation.linkTarget === undefined ? {} : { linkTarget: mutation.linkTarget }) })),
    moduleOrder: plan.moduleOrder,
    receiptPath: join(plan.stateDirectory, "receipt.json"),
    repositoryPreconditions: plan.repositoryPreconditions,
    sensitiveAssignmentCount: plan.privateMigration?.selectedLineIndexes.length ?? 0,
  };
}

export function runMzshCli(args: readonly string[], dependencies: RunMzshCliDependencies): number {
  const parsed = parseArguments(args);
  if (parsed.kind === "unmanaged") return 2;
  if (parsed.kind === "retired") { dependencies.write("MZSH_MIGRATION_REQUIRED"); return 2; }
  if (parsed.kind === "usage-error") { dependencies.write(`MZSH_USAGE_${parsed.code}`); return 2; }
  const filesystem = dependencies.filesystem ?? new NodeAdoptionFilesystem();
  if (parsed.kind === "audit") {
    const repositoryRoot = parsed.source ?? dependencies.repositoryRoot;
    const report = auditEnvironment((dependencies.probes ?? new EnvironmentProbes()).collect({ home: dependencies.home, xdgConfig: dependencies.xdgConfig, xdgCache: dependencies.xdgCache, repositoryRoot }));
    if (parsed.json) dependencies.write(JSON.stringify(report));
    else for (const finding of report.findings) dependencies.write(`${finding.severity.toUpperCase()} ${finding.code} ${finding.message}`);
    return 0;
  }
  if (parsed.kind === "rollback") {
    const result = (dependencies.rollback ?? rollbackAdoption)({ receiptPath: join(dependencies.xdgConfig, "mzsh", "state", parsed.receiptId, "receipt.json"), dryRun: !parsed.apply }, { filesystem });
    dependencies.write(JSON.stringify(result));
    return isSuccess(result) ? 0 : 1;
  }
  const repository = parsed.kind === "bootstrap" ? parsed.source : parsed.source ?? dependencies.repositoryRoot;
  const legacySource = parsed.kind === "bootstrap" ? parsed.legacySource : undefined;
  const planned = planAdoption({ home: dependencies.home, config: dependencies.xdgConfig, repository, ...(legacySource === undefined ? {} : { legacySource }) }, { filesystem, id: dependencies.id ?? randomUUID, isSensitiveAssignment: classifySensitiveAssignment });
  if (planned.kind !== "ready") { dependencies.write(`MZSH_${planned.code}`); return 1; }
  dependencies.write(JSON.stringify(planSummary(planned.plan)));
  if (!parsed.apply) return 0;
  const result = (dependencies.apply ?? applyAdoption)(planned.plan, { filesystem, preflight: (candidate) => (dependencies.preflight ?? new ZshPreflight()).preflight(candidate) });
  dependencies.write(JSON.stringify(result));
  return isSuccess(result) ? 0 : 1;
}
