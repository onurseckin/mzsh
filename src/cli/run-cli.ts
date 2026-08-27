import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { applyAdoption } from '../application/apply-adoption';
import { ReviewedPlanApplicationService } from '../application/apply-reviewed-plan';
import { auditEnvironment } from '../application/audit-environment';
import { InventoryService } from '../application/inventory-service';
import { adoptionPlanFingerprint, planAdoption } from '../application/plan-adoption';
import { rollbackAdoption, rollbackStateDigest } from '../application/rollback-adoption';
import { classifySensitiveAssignment } from '../application/sensitive-assignment-policy';
import type { AdoptionPlan, AdoptionApplyResult, AdoptionRollbackResult } from '../domain/adoption';
import type { EnvironmentSnapshot } from '../domain/audit';
import {
  projectInventoryRecords,
  type InventoryCollectionInput,
  type InventoryRecord,
} from '../domain/inventory';
import { CategoryRegistry } from '../domain/categories';
import { createReviewedPlan } from '../domain/action-plan';
import { createRecoverySnapshot } from '../domain/history';
import type { EnvironmentService } from '../application/environment-service';
import { SqliteHistory } from '../infrastructure/history-sqlite';
import { NodeAdoptionFilesystem } from '../infrastructure/adoption-filesystem';
import { EnvironmentProbes } from '../infrastructure/environment-probes';
import { InventoryProbes } from '../infrastructure/inventory-probes';
import { readMachineManifest } from '../infrastructure/manifest-reader';
import { ZshPreflight } from '../infrastructure/zsh-preflight';
import { parseArguments } from './parse-arguments';
import { runEnvironmentCommand } from './environment-command';
import { runLifecycleCommand } from './setup-command';

type PreflightResult =
  | { kind: 'passed' }
  | { kind: 'failed'; code: 'syntax-invalid' | 'isolated-startup-failed' };
type Preflight = { preflight(plan: AdoptionPlan): PreflightResult };
type Probes = {
  collect(options: {
    home: string;
    xdgConfig: string;
    xdgCache: string;
    repositoryRoot: string;
  }): EnvironmentSnapshot;
};
type InventoryCollector = {
  collect(input: InventoryCollectionInput): readonly InventoryRecord[];
};
type EnvironmentOperations = Pick<EnvironmentService, 'list' | 'get' | 'set'>;
type AuthenticationLease = { acquire(): unknown };

export interface RunMzshCliDependencies {
  home: string;
  xdgConfig: string;
  xdgCache: string;
  repositoryRoot: string;
  write(message: string): void;
  filesystem?: NodeAdoptionFilesystem;
  probes?: Probes;
  inventory?: InventoryCollector;
  environment?: EnvironmentOperations;
  authLease?: AuthenticationLease;
  preflight?: Preflight;
  id?: () => string;
  reviewedPlanId?: () => string;
  apply?: typeof applyAdoption;
  rollback?: typeof rollbackAdoption;
  rollbackStateDigest?: typeof rollbackStateDigest;
  setup?: import('../application/setup-service').SetupService;
}

function defaultInventoryCollector(): InventoryCollector {
  const manifest = readMachineManifest(
    join(__dirname, '..', '..', 'manifests', 'machine-manifest.json')
  );
  return new InventoryService(new CategoryRegistry(manifest.categories), [new InventoryProbes()]);
}

function collectInventory(
  dependencies: RunMzshCliDependencies,
  input: InventoryCollectionInput
): readonly InventoryRecord[] | undefined {
  try {
    return (dependencies.inventory ?? defaultInventoryCollector()).collect(input);
  } catch {
    return undefined;
  }
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

function historyDirectory(dependencies: RunMzshCliDependencies): string {
  return join(dependencies.xdgCache, 'mzsh', 'history');
}

function writePlanConfirmationRequired(dependencies: RunMzshCliDependencies): number {
  dependencies.write('MZSH_PLAN_CONFIRMATION_REQUIRED');
  return 1;
}

function adoptionSnapshot(plan: AdoptionPlan): ReturnType<typeof createRecoverySnapshot> {
  return createRecoverySnapshot({
    id: randomUUID(),
    kind: 'managed-state',
    capturedAt: new Date(),
    targets: plan.targets.map((target) => ({
      name:
        target.category === 'loader'
          ? 'managed-loader'
          : target.category === 'private' || target.category === 'legacy'
            ? 'managed-private'
            : target.category === 'shims'
              ? 'managed-shims'
              : 'managed-current',
      state: target.before.kind,
    })),
  });
}

function rollbackSnapshot(): ReturnType<typeof createRecoverySnapshot> {
  return createRecoverySnapshot({
    id: randomUUID(),
    kind: 'adoption-receipt',
    capturedAt: new Date(),
    targets: [{ name: 'adoption-receipt', state: 'file' }],
  });
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
  if (parsed.kind === 'env') return runEnvironmentCommand(parsed, dependencies);
  if (parsed.kind === 'setup' || parsed.kind === 'update')
    return runLifecycleCommand(parsed, dependencies);
  const filesystem = dependencies.filesystem ?? new NodeAdoptionFilesystem();
  if (parsed.kind === 'audit') {
    const repositoryRoot = parsed.source ?? dependencies.repositoryRoot;
    const snapshot = (dependencies.probes ?? new EnvironmentProbes()).collect({
      home: dependencies.home,
      xdgConfig: dependencies.xdgConfig,
      xdgCache: dependencies.xdgCache,
      repositoryRoot,
    });
    const report = auditEnvironment(snapshot, collectInventory(dependencies, { snapshot }) ?? []);
    if (parsed.json) dependencies.write(JSON.stringify(report));
    else
      for (const finding of report.findings)
        dependencies.write(`${finding.severity.toUpperCase()} ${finding.code} ${finding.message}`);
    return 0;
  }
  if (parsed.kind === 'inventory') {
    const snapshot = (dependencies.probes ?? new EnvironmentProbes()).collect({
      home: dependencies.home,
      xdgConfig: dependencies.xdgConfig,
      xdgCache: dependencies.xdgCache,
      repositoryRoot: dependencies.repositoryRoot,
    });
    const records = collectInventory(dependencies, {
      ...(parsed.categoryId === undefined ? {} : { categoryId: parsed.categoryId }),
      snapshot,
    });
    if (records === undefined) {
      dependencies.write('MZSH_USAGE_inventory-unavailable');
      return 2;
    }
    const projectedRecords = projectInventoryRecords(records);
    if (parsed.json) dependencies.write(JSON.stringify(projectedRecords));
    else
      for (const record of projectedRecords) {
        const version = record.version === undefined ? '' : ` ${record.version}`;
        dependencies.write(`${record.categoryId} ${record.name} ${record.status}${version}`);
      }
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
    const fingerprint = (dependencies.rollbackStateDigest ?? rollbackStateDigest)(
      { receiptPath, dryRun: true },
      { filesystem }
    );
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
      if (fingerprint === undefined) {
        history.close();
        dependencies.write('MZSH_ROLLBACK_STATE_UNAVAILABLE');
        return 1;
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
        snapshot: () => {
          const verified = (dependencies.rollback ?? rollbackAdoption)(
            { receiptPath, dryRun: true },
            { filesystem }
          );
          if (verified.kind !== 'ready') throw new Error('ROLLBACK_SNAPSHOT_UNAVAILABLE');
          return rollbackSnapshot();
        },
        revalidate: () =>
          (dependencies.rollbackStateDigest ?? rollbackStateDigest)(
            { receiptPath, dryRun: true },
            { filesystem }
          ) === fingerprint,
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
  const repository = parsed.kind === 'bootstrap' ? parsed.source : dependencies.repositoryRoot;
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
      snapshot: () => adoptionSnapshot(planned.plan),
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
