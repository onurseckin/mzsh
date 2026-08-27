import { basename, join } from 'node:path';
import type {
  AdoptionApplyResult,
  AdoptionMutation,
  AdoptionReceipt,
  AdoptionReceiptTarget,
  AdoptionTargetState,
} from '../domain/adoption';
import type { AdoptionPlan } from '../domain/adoption';
import type { RegularFileSnapshot } from '../infrastructure/adoption-filesystem';
import { NodeAdoptionFilesystem } from '../infrastructure/adoption-filesystem';
import { renderStableLoader } from './render-stable-loader';

export interface ApplyAdoptionDependencies {
  filesystem: NodeAdoptionFilesystem;
  preflight(
    plan: AdoptionPlan
  ): { kind: 'passed' } | { kind: 'failed'; code: 'syntax-invalid' | 'isolated-startup-failed' };
  beforeMutation?(category: AdoptionMutation['category']): void;
  failAfterMutation?(category: AdoptionMutation['category']): boolean;
  failAfterReceiptPublication?(): boolean;
}

function sameState(left: AdoptionTargetState, right: AdoptionTargetState): boolean {
  return (
    left.kind === right.kind &&
    left.mode === right.mode &&
    left.ownerId === right.ownerId &&
    left.hash === right.hash &&
    left.linkTarget === right.linkTarget
  );
}

function receiptPath(plan: AdoptionPlan): string {
  return join(plan.stateDirectory, 'receipt.json');
}

export function applyAdoption(
  plan: AdoptionPlan,
  dependencies: ApplyAdoptionDependencies
): AdoptionApplyResult {
  const filesystem = dependencies.filesystem;
  try {
    if (
      !filesystem.hasSafeOwnedRoot(plan.home) ||
      !filesystem.hasSafeOwnedRoot(plan.config) ||
      !filesystem.hasSafeOwnedRoot(plan.repository) ||
      !filesystem.isContainedWithoutEscape(plan.home, plan.config)
    ) {
      return { kind: 'failed', stage: 'preflight', code: 'unsafe-root', path: plan.home };
    }
  } catch {
    return { kind: 'failed', stage: 'preflight', code: 'metadata-unavailable', path: plan.home };
  }
  try {
    for (const target of plan.targets) {
      if (!sameState(target.before, filesystem.describe(target.path))) {
        return { kind: 'failed', stage: 'preflight', code: 'source-changed', path: target.path };
      }
    }
  } catch {
    return { kind: 'failed', stage: 'preflight', code: 'metadata-unavailable', path: plan.home };
  }
  try {
    if (
      filesystem.hash(plan.entrypoint) !== plan.repositoryPreconditions.entrypointHash ||
      filesystem.hash(join(plan.repository, 'package.json')) !==
        plan.repositoryPreconditions.packageHash
    ) {
      return {
        kind: 'failed',
        stage: 'preflight',
        code: 'repository-changed',
        path: plan.repository,
      };
    }
  } catch {
    return {
      kind: 'failed',
      stage: 'preflight',
      code: 'repository-changed',
      path: plan.repository,
    };
  }
  let preflight:
    | { kind: 'passed' }
    | { kind: 'failed'; code: 'syntax-invalid' | 'isolated-startup-failed' };
  try {
    preflight = dependencies.preflight(plan);
  } catch {
    return {
      kind: 'failed',
      stage: 'preflight',
      code: 'preflight-unavailable',
      path: plan.entrypoint,
    };
  }
  if (preflight.kind === 'failed')
    return { kind: 'failed', stage: 'preflight', code: preflight.code, path: plan.entrypoint };

  let legacySnapshot: RegularFileSnapshot | undefined;
  if (plan.privateMigration !== undefined) {
    try {
      legacySnapshot = filesystem.readRegularUtf8NoFollow(plan.privateMigration.sourcePath);
      const sourceTarget = plan.targets.find(
        (target) => target.path === plan.privateMigration?.sourcePath
      );
      if (
        sourceTarget === undefined ||
        legacySnapshot.state.hash !== plan.privateMigration.sourceHash ||
        !sameState(sourceTarget.before, legacySnapshot.state)
      ) {
        return {
          kind: 'failed',
          stage: 'preflight',
          code: 'source-changed',
          path: plan.privateMigration.sourcePath,
        };
      }
    } catch {
      return {
        kind: 'failed',
        stage: 'preflight',
        code: 'source-changed',
        path: plan.privateMigration.sourcePath,
      };
    }
  }

  const backupPaths = new Map<string, string>();
  const journal: Array<(typeof plan.targets)[number]> = [];
  let publishedReceipt = false;
  let failureCode = 'mutation-failed';
  try {
    const managedRoot = join(plan.config, 'mzsh');
    filesystem.ensureDirectory(managedRoot, 0o700, true);
    filesystem.ensureDirectory(join(managedRoot, 'state'), 0o700, true);
    filesystem.ensureDirectory(plan.stateDirectory, 0o700, true);
    filesystem.ensureDirectory(plan.backupDirectory, 0o700, true);
    for (const [index, target] of plan.targets.entries()) {
      if (target.before.kind === 'file') {
        const backupPath = join(plan.backupDirectory, `${index}-${basename(target.path)}`);
        filesystem.backup(target.before, backupPath);
        backupPaths.set(target.path, backupPath);
      }
    }

    for (const mutation of plan.mutations) {
      const target = plan.targets.find((candidate) => candidate.path === mutation.path);
      if (target === undefined) continue;
      dependencies.beforeMutation?.(mutation.category);
      if (!filesystem.hasSafeAtomicParent(mutation.path)) throw new Error('unsafe atomic parent');
      if (mutation.category === 'legacy' && plan.privateMigration !== undefined) {
        if (
          legacySnapshot === undefined ||
          !sameState(legacySnapshot.state, filesystem.describe(plan.privateMigration.sourcePath))
        ) {
          failureCode = 'source-changed';
          throw new Error('legacy source changed');
        }
      }
      journal.push(target);
      if (mutation.kind === 'symlink' && mutation.linkTarget !== undefined) {
        filesystem.linkAtomic(mutation.path, mutation.linkTarget);
      } else if (mutation.category === 'loader') {
        filesystem.writeAtomic(
          mutation.path,
          renderStableLoader(basename(mutation.path) as '.zshenv' | '.zprofile' | '.zshrc')
        );
      } else if (mutation.category === 'private') {
        const existingPrivate = target.before.kind === 'file' ? filesystem.read(mutation.path) : '';
        const privateLines =
          plan.privateMigration === undefined
            ? ''
            : plan.privateMigration.selectedLineIndexes
                .map((index) => legacySnapshot?.text.split(/(?<=\n)/)[index] ?? '')
                .join('');
        filesystem.writeAtomic(
          mutation.path,
          `${existingPrivate}${existingPrivate.length > 0 && !existingPrivate.endsWith('\n') && privateLines.length > 0 ? '\n' : ''}${privateLines}`
        );
      } else if (mutation.category === 'legacy' && plan.privateMigration !== undefined) {
        const snapshot = legacySnapshot;
        if (snapshot === undefined) throw new Error('legacy snapshot unavailable');
        const lines = snapshot.text.split(/(?<=\n)/);
        filesystem.writeAtomic(
          mutation.path,
          lines
            .filter((_line, index) => !plan.privateMigration!.selectedLineIndexes.includes(index))
            .join('')
        );
      }
      if (dependencies.failAfterMutation?.(mutation.category) === true) throw new Error('injected');
    }

    const targets: AdoptionReceiptTarget[] = plan.targets.map((target, index) => ({
      category: target.category,
      original: target.before,
      applied: filesystem.describe(target.path),
      ...(backupPaths.has(target.path)
        ? { backupRelativePath: join('backups', `${index}-${basename(target.path)}`) }
        : {}),
    }));
    const receipt: AdoptionReceipt = {
      schema: 'mzsh.adoption-receipt/v1',
      status: 'applied',
      id: plan.id,
      home: plan.home,
      config: plan.config,
      stateDirectory: plan.stateDirectory,
      repository: {
        root: plan.repository,
        version: plan.repositoryMetadata.version,
        commit: plan.repositoryMetadata.commit,
      },
      moduleOrder: plan.moduleOrder,
      pathOrder: plan.mutations.map((mutation) => mutation.category),
      preflight: { kind: 'passed' },
      targets,
    };
    filesystem.writeAtomic(receiptPath(plan), JSON.stringify(receipt), 0o600);
    publishedReceipt = true;
    if (dependencies.failAfterReceiptPublication?.() === true) throw new Error('injected');
    return { kind: 'applied', receiptPath: receiptPath(plan) };
  } catch {
    let restorationFailed = false;
    for (const target of [...journal].reverse()) {
      try {
        filesystem.restore(target.before, backupPaths.get(target.path));
      } catch {
        restorationFailed = true;
      }
    }
    let receiptExists = publishedReceipt;
    try {
      receiptExists = receiptExists || filesystem.describe(receiptPath(plan)).kind !== 'absent';
    } catch {
      restorationFailed = true;
    }
    if (receiptExists) {
      try {
        filesystem.remove(receiptPath(plan));
      } catch {
        restorationFailed = true;
      }
    }
    return {
      kind: 'failed',
      stage: 'apply',
      code: restorationFailed ? 'restoration-failed' : failureCode,
      path: journal.at(-1)?.path ?? plan.home,
    };
  }
}
