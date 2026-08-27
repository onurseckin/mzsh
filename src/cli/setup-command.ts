import { randomUUID } from 'node:crypto';
import { ReviewedPlanApplicationService } from '../application/apply-reviewed-plan';
import { SetupService, setupPlanFingerprint } from '../application/setup-service';
import { createReviewedPlan } from '../domain/action-plan';
import { createRecoverySnapshot } from '../domain/history';
import type { ManagedCommand } from '../catalog/types';
import { GitClient } from '../infrastructure/git-client';
import { LocalRepository } from '../infrastructure/local-repository';
import { GlobalBunLink, ShellSetup } from '../infrastructure/shell-setup';
import { SqliteHistory } from '../infrastructure/history-sqlite';
import type { RunMzshCliDependencies } from './run-cli';

function service(dependencies: RunMzshCliDependencies): SetupService {
  return (
    dependencies.setup ??
    new SetupService({
      home: dependencies.home,
      repository: new LocalRepository(),
      git: new GitClient(),
      linker: new GlobalBunLink(),
      shell: new ShellSetup(dependencies.home),
    })
  );
}

function historyDirectory(dependencies: RunMzshCliDependencies): string {
  return `${dependencies.xdgCache}/mzsh/history`;
}

function reviewedPlanId(dependencies: RunMzshCliDependencies): string {
  return (dependencies.reviewedPlanId ?? randomUUID)();
}

function snapshot(): ReturnType<typeof createRecoverySnapshot> {
  return createRecoverySnapshot({
    id: randomUUID(),
    kind: 'managed-state',
    capturedAt: new Date(),
    targets: [{ name: 'managed-current', state: 'absent' }],
  });
}

export function runSetupCommand(
  parsed: Extract<ManagedCommand, { kind: 'setup' }>,
  dependencies: RunMzshCliDependencies
): number {
  const setup = service(dependencies);
  const planned = setup.planSetup();
  if (planned.kind === 'blocked') {
    dependencies.write(`MZSH_${planned.code}`);
    return 1;
  }
  const fingerprint = setupPlanFingerprint(planned.plan);
  const history = new SqliteHistory(historyDirectory(dependencies));
  if (!parsed.apply) {
    const reviewed = createReviewedPlan({
      id: reviewedPlanId(dependencies),
      action: 'setup',
      targetNames: ['managed-current'],
      fingerprint,
      now: new Date(),
    });
    history.save(reviewed);
    history.close();
    dependencies.write(JSON.stringify({ ...planned.plan, reviewedPlanId: reviewed.id }));
    return 0;
  }
  try {
    const result = new ReviewedPlanApplicationService(history, history).apply({
      planId: parsed.planId,
      confirmation: parsed.confirmation,
      action: 'setup',
      fingerprint,
      now: new Date(),
      snapshot,
      revalidate: () => {
        const current = setup.planSetup();
        return current.kind === 'ready' && setupPlanFingerprint(current.plan) === fingerprint;
      },
      execute: () => setup.applySetup(planned.plan),
    });
    dependencies.write(JSON.stringify(result));
    return result.kind === 'applied' ? 0 : 1;
  } catch (error) {
    if (error instanceof Error && error.message === 'PLAN_CONFIRMATION_REQUIRED') {
      dependencies.write('MZSH_PLAN_CONFIRMATION_REQUIRED');
      return 1;
    }
    throw error;
  } finally {
    history.close();
  }
}
