import { randomUUID } from 'node:crypto';
import { ReviewedPlanApplicationService } from '../application/apply-reviewed-plan';
import { SetupService, setupPlanFingerprint } from '../application/setup-service';
import { createReviewedPlan } from '../domain/action-plan';
import { createRecoverySnapshot } from '../domain/history';
import type { ManagedCommand } from '../catalog/types';
import { GitClient } from '../infrastructure/git-client';
import { LocalRepository } from '../infrastructure/local-repository';
import { GlobalBunLink, ShellSetup } from '../infrastructure/shell-setup';
import { findExistingReviewedPlan, SqliteHistory } from '../infrastructure/history-sqlite';
import type { RunMzshCliDependencies } from './run-cli';

function service(dependencies: RunMzshCliDependencies): SetupService {
  return dependencies.setup !== undefined
    ? dependencies.setup
    : new SetupService({
        home: dependencies.home,
        repository: new LocalRepository(),
        git: new GitClient(),
        linker: new GlobalBunLink(),
        shell: new ShellSetup(dependencies.home),
      });
}

function historyDirectory(dependencies: RunMzshCliDependencies): string {
  return `${dependencies.xdgCache}/mzsh/history`;
}

function reviewedPlanId(dependencies: RunMzshCliDependencies): string {
  return (dependencies.reviewedPlanId !== undefined ? dependencies.reviewedPlanId : randomUUID)();
}

function snapshot(): ReturnType<typeof createRecoverySnapshot> {
  return createRecoverySnapshot({
    id: randomUUID(),
    kind: 'managed-state',
    capturedAt: new Date(),
    targets: [{ name: 'managed-current', state: 'absent' }],
  });
}

type LifecycleCommand = Extract<ManagedCommand, { kind: 'setup' | 'update' }>;

interface LifecyclePreparation {
  action: LifecycleCommand['kind'];
  plan: object;
  operations: readonly { kind: string }[];
  execute(): ReturnType<SetupService['applySetup']>;
  revalidate(): boolean;
}

function confirmationRequired(dependencies: RunMzshCliDependencies): number {
  dependencies.write('MZSH_PLAN_CONFIRMATION_REQUIRED');
  return 1;
}

function planOutput(
  action: LifecycleCommand['kind'],
  operations: readonly { kind: string }[],
  reviewedPlanId: string
): string {
  return JSON.stringify({
    schema: 'mzsh.lifecycle-plan/v1',
    action,
    operations: operations.map((operation) => operation.kind),
    reviewedPlanId,
  });
}

function resultOutput(result: { kind: string; evidence?: readonly string[] }): string {
  return JSON.stringify({
    kind: result.kind,
    ...(result.evidence === undefined ? {} : { evidence: result.evidence }),
  });
}

function prepareLifecycle(
  parsed: LifecycleCommand,
  setup: SetupService
): LifecyclePreparation | { code: string } {
  if (parsed.kind === 'setup') {
    const planned = setup.planSetup();
    if (planned.kind === 'blocked') return { code: planned.code };
    return {
      action: 'setup',
      plan: planned.plan,
      operations: planned.plan.operations,
      execute: () => setup.applySetup(planned.plan),
      revalidate: () => {
        const current = setup.planSetup();
        return (
          current.kind === 'ready' &&
          setupPlanFingerprint(current.plan) === setupPlanFingerprint(planned.plan)
        );
      },
    };
  }
  const planned = setup.planUpdate();
  if (planned.kind === 'blocked') return { code: planned.code };
  if (planned.kind !== 'ready') throw new Error('UPDATE_PLAN_INVALID');
  const plan = { schema: 'mzsh.update-plan/v1', operations: planned.operations };
  return {
    action: 'update',
    plan,
    operations: planned.operations,
    execute: () => setup.applyUpdate(),
    revalidate: () => {
      const current = setup.planUpdate();
      return (
        current.kind === 'ready' &&
        setupPlanFingerprint({ schema: 'mzsh.update-plan/v1', operations: current.operations }) ===
          setupPlanFingerprint(plan)
      );
    },
  };
}

export function runLifecycleCommand(
  parsed: LifecycleCommand,
  dependencies: RunMzshCliDependencies
): number {
  if (parsed.apply && (parsed.planId === undefined ? true : parsed.confirmation !== 'APPLY'))
    return confirmationRequired(dependencies);
  const setup = service(dependencies);
  const prepared = prepareLifecycle(parsed, setup);
  if ('code' in prepared) {
    dependencies.write(`MZSH_${prepared.code}`);
    return 1;
  }
  const fingerprint = setupPlanFingerprint(prepared.plan);
  if (!parsed.apply) {
    const history = new SqliteHistory(historyDirectory(dependencies));
    const reviewed = createReviewedPlan({
      id: reviewedPlanId(dependencies),
      action: prepared.action,
      targetNames: ['managed-current'],
      fingerprint,
      now: new Date(),
    });
    history.save(reviewed);
    history.close();
    dependencies.write(planOutput(prepared.action, prepared.operations, reviewed.id));
    return 0;
  }
  if (parsed.planId === undefined) return confirmationRequired(dependencies);
  let existing;
  try {
    existing = findExistingReviewedPlan(historyDirectory(dependencies), parsed.planId);
  } catch {
    return confirmationRequired(dependencies);
  }
  if (
    existing === undefined
      ? true
      : existing.action !== prepared.action
        ? true
        : existing.fingerprint !== fingerprint
  ) {
    return confirmationRequired(dependencies);
  }
  const history = new SqliteHistory(historyDirectory(dependencies));
  try {
    const result = new ReviewedPlanApplicationService(history, history).apply({
      planId: parsed.planId,
      confirmation: parsed.confirmation,
      action: prepared.action,
      fingerprint,
      now: new Date(),
      snapshot,
      revalidate: () => prepared.revalidate(),
      execute: () => prepared.execute(),
    });
    dependencies.write(resultOutput(result));
    return result.kind === 'applied' ? 0 : 1;
  } catch (error) {
    if (error instanceof Error && error.message === 'PLAN_CONFIRMATION_REQUIRED')
      return confirmationRequired(dependencies);
    throw error;
  } finally {
    history.close();
  }
}
