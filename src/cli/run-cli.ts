import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { applyAdoption } from '../application/apply-adoption';
import { ReviewedPlanApplicationService } from '../application/apply-reviewed-plan';
import { auditEnvironment } from '../application/audit-environment';
import { adoptionPlanFingerprint, planAdoption } from '../application/plan-adoption';
import { rollbackAdoption } from '../application/rollback-adoption';
import { classifySensitiveAssignment } from '../application/sensitive-assignment-policy';
import type { AdoptionPlan, AdoptionApplyResult, AdoptionRollbackResult } from '../domain/adoption';
import type { EnvironmentSnapshot } from '../domain/audit';
import { createReviewedPlan } from '../domain/action-plan';
import { SqliteHistory } from '../infrastructure/history-sqlite';
import { NodeAdoptionFilesystem } from '../infrastructure/adoption-filesystem';
import { EnvironmentProbes } from '../infrastructure/environment-probes';
import { ZshPreflight } from '../infrastructure/zsh-preflight';
import { parseArguments } from './parse-arguments';

type Preflight = {
  preflight(
    plan: AdoptionPlan
  ): { kind: 'passed' } | { kind: 'failed'; code: 'syntax-invalid' | 'isolated-startup-failed' };
};
type Probes = {
  collect(options: {
    home: string;
    xdgConfig: string;
    xdgCache: string;
    repositoryRoot: string;
  }): EnvironmentSnapshot;
};

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
  reviewedPlanId?: () => string;
  apply?: typeof applyAdoption;
  rollback?: typeof rollbackAdoption;
}

function isSuccess(result: AdoptionApplyResult | AdoptionRollbackResult): boolean {
  return result.kind === 'applied' || result.kind === 'rolled-back' || result.kind === 'ready';
}

function planSummary(plan: AdoptionPlan): object {
  return {
    schema: plan.schema,
    id: plan.id,
    targets: plan.targets.map((target) => ({
      path: target.path,
      kind: target.before.kind,
      mode: target.before.mode,
      hash: target.before.hash,
      linkTarget: target.before.linkTarget,
    })),
    mutations: plan.mutations.map((mutation) => ({
      category: mutation.category,
      path: mutation.path,
      kind: mutation.kind,
      ...(mutation.linkTarget === undefined ? {} : { linkTarget: mutation.linkTarget }),
    })),
    moduleOrder: plan.moduleOrder,
    receiptPath: join(plan.stateDirectory, 'receipt.json'),
    repositoryPreconditions: plan.repositoryPreconditions,
    sensitiveAssignmentCount: plan.privateMigration?.selectedLineIndexes.length ?? 0,
  };
}

function reviewedPlanId(dependencies: RunMzshCliDependencies): string {
  return (dependencies.reviewedPlanId ?? randomUUID)();
}

function rollbackFingerprint(config: string, receiptId: string): string {
  return createHash('sha256').update(`${config}:${receiptId}`).digest('hex');
}

function historyDirectory(dependencies: RunMzshCliDependencies): string {
  return join(dependencies.xdgCache, 'mzsh', 'history');
}

function writePlanConfirmationRequired(dependencies: RunMzshCliDependencies): number {
  dependencies.write('MZSH_PLAN_CONFIRMATION_REQUIRED');
  return 1;
}

export function runMzshCli(args: readonly string[], dependencies: RunMzshCliDependencies): number {
  const parsed = parseArguments(args);
  if (parsed.kind === 'unmanaged') return 2;
  if (parsed.kind === 'retired') {
    dependencies.write('MZSH_MIGRATION_REQUIRED');
    return 2;
  }
  if (parsed.kind === 'usage-error') {
    dependencies.write(`MZSH_USAGE_${parsed.code}`);
    return 2;
  }
  if (parsed.kind === 'catalog-placeholder') {
    dependencies.write('MZSH_USAGE_command-unavailable');
    return 2;
  }
  const filesystem = dependencies.filesystem ?? new NodeAdoptionFilesystem();
  if (parsed.kind === 'audit') {
    const repositoryRoot = parsed.source ?? dependencies.repositoryRoot;
    const report = auditEnvironment(
      (dependencies.probes ?? new EnvironmentProbes()).collect({
        home: dependencies.home,
        xdgConfig: dependencies.xdgConfig,
        xdgCache: dependencies.xdgCache,
        repositoryRoot,
      })
    );
    if (parsed.json) dependencies.write(JSON.stringify(report));
    else
      for (const finding of report.findings)
        dependencies.write(`${finding.severity.toUpperCase()} ${finding.code} ${finding.message}`);
    return 0;
  }
  if (parsed.kind === 'rollback') {
    const history = new SqliteHistory(historyDirectory(dependencies));
    const receiptPath = join(
      dependencies.xdgConfig,
      'mzsh',
      'state',
      parsed.receiptId,
      'receipt.json'
    );
    const fingerprint = rollbackFingerprint(dependencies.xdgConfig, parsed.receiptId);
    if (!parsed.apply) {
      const result = (dependencies.rollback ?? rollbackAdoption)(
        { receiptPath, dryRun: true },
        { filesystem }
      );
      if (result.kind !== 'ready') {
        history.close();
        dependencies.write(JSON.stringify(result));
        return isSuccess(result) ? 0 : 1;
      }
      const reviewed = createReviewedPlan({
        id: reviewedPlanId(dependencies),
        action: 'rollback',
        targetNames: ['adoption-receipt'],
        fingerprint,
        now: new Date(),
      });
      history.save(reviewed);
      history.close();
      dependencies.write(JSON.stringify({ ...result, reviewedPlanId: reviewed.id }));
      return 0;
    }
    try {
      const applied = new ReviewedPlanApplicationService(history, history).apply({
        planId: parsed.planId,
        confirmation: parsed.confirmation,
        action: 'rollback',
        fingerprint,
        now: new Date(),
        snapshot: () => ({ kind: 'adoption-receipt' }),
        execute: () =>
          (dependencies.rollback ?? rollbackAdoption)(
            { receiptPath, dryRun: false },
            { filesystem }
          ),
      });
      dependencies.write(JSON.stringify(applied));
      return isSuccess(applied) ? 0 : 1;
    } catch (error) {
      if (error instanceof Error && error.message === 'PLAN_CONFIRMATION_REQUIRED')
        return writePlanConfirmationRequired(dependencies);
      throw error;
    } finally {
      history.close();
    }
  }
  const repository =
    parsed.kind === 'bootstrap' ? parsed.source : (parsed.source ?? dependencies.repositoryRoot);
  const legacySource = parsed.kind === 'bootstrap' ? parsed.legacySource : undefined;
  const planned = planAdoption(
    {
      home: dependencies.home,
      config: dependencies.xdgConfig,
      repository,
      ...(legacySource === undefined ? {} : { legacySource }),
    },
    {
      filesystem,
      id: dependencies.id ?? randomUUID,
      isSensitiveAssignment: classifySensitiveAssignment,
    }
  );
  if (planned.kind !== 'ready') {
    dependencies.write(`MZSH_${planned.code}`);
    return 1;
  }
  const history = new SqliteHistory(historyDirectory(dependencies));
  const action = parsed.kind;
  const fingerprint = adoptionPlanFingerprint(planned.plan);
  if (!parsed.apply) {
    const reviewed = createReviewedPlan({
      id: reviewedPlanId(dependencies),
      action,
      targetNames: ['managed-loader', 'managed-private', 'managed-shims', 'managed-current'],
      fingerprint,
      now: new Date(),
    });
    history.save(reviewed);
    history.close();
    dependencies.write(
      JSON.stringify({ ...planSummary(planned.plan), reviewedPlanId: reviewed.id })
    );
    return 0;
  }
  try {
    const result = new ReviewedPlanApplicationService(history, history).apply({
      planId: parsed.planId,
      confirmation: parsed.confirmation,
      action,
      fingerprint,
      now: new Date(),
      snapshot: () => ({ kind: 'managed-state' }),
      execute: () =>
        (dependencies.apply ?? applyAdoption)(planned.plan, {
          filesystem,
          preflight: (candidate) =>
            (dependencies.preflight ?? new ZshPreflight()).preflight(candidate),
        }),
    });
    dependencies.write(JSON.stringify(result));
    return isSuccess(result) ? 0 : 1;
  } catch (error) {
    if (error instanceof Error && error.message === 'PLAN_CONFIRMATION_REQUIRED')
      return writePlanConfirmationRequired(dependencies);
    throw error;
  } finally {
    history.close();
  }
}
