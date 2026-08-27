import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { inspectRepositorySafety, type RepositorySafetyGit } from './repository-safety';
import type { RepositoryState } from '../domain/repository-state';
import type { SetupOperation, SetupPlan, SetupPlanResult, UpdateResult } from '../domain/setup';

const setupRepositorySource = 'https://github.com/onurseckin/mzsh.git';

export interface SetupRepository {
  inspect(root: string): RepositoryState;
}

export interface SetupGit extends RepositorySafetyGit {
  canFastForward(root: string): boolean;
  fetch(root: string): void;
  pullFastForward(root: string): void;
  clone(source: string, target: string): void;
}

export interface BunLinker {
  link(root: string): string;
}

export interface ShellReconciler {
  reconcile(root: string): string;
}

export interface SetupServiceDependencies {
  home: string;
  repository: SetupRepository;
  git: SetupGit;
  linker?: BunLinker;
  shell?: ShellReconciler;
}

type SetupOperationsResult =
  | readonly SetupOperation[]
  | {
      kind: 'blocked';
      code:
        | 'REPOSITORY_DIVERGED'
        | 'REPOSITORY_UNAVAILABLE'
        | 'REPOSITORY_DIRTY'
        | 'REPOSITORY_UNPUSHED';
    };

function isBlocked(
  result: SetupOperationsResult
): result is Exclude<SetupOperationsResult, readonly SetupOperation[]> {
  return !Array.isArray(result);
}

export class SetupService {
  constructor(private readonly dependencies: SetupServiceDependencies) {}

  planSetup(): SetupPlanResult {
    const target = this.target();
    const state = this.dependencies.repository.inspect(target);
    if (state.kind === 'invalid') return { kind: 'blocked', code: 'REPOSITORY_INVALID' };
    const repositoryOperations =
      state.kind === 'missing'
        ? [{ kind: 'clone' as const, source: setupRepositorySource, target }]
        : this.updateOperations(target);
    if (isBlocked(repositoryOperations)) return repositoryOperations;
    return {
      kind: 'ready',
      plan: {
        schema: 'mzsh.setup-plan/v1',
        target,
        operations: [
          ...repositoryOperations,
          { kind: 'bun-link', root: target },
          { kind: 'shell-reconcile', root: target },
        ],
      },
    };
  }

  planUpdate(): UpdateResult {
    const root = this.target();
    const state = this.dependencies.repository.inspect(root);
    if (state.kind !== 'present') return { kind: 'blocked', code: 'REPOSITORY_INVALID' };
    const operations = this.updateOperations(root);
    if (isBlocked(operations)) return operations;
    return { kind: 'ready', root, operations };
  }

  applySetup(plan: SetupPlan): UpdateResult {
    const evidence: string[] = [];
    for (const operation of plan.operations) {
      if (operation.kind === 'clone') {
        this.dependencies.git.clone(operation.source, operation.target);
        evidence.push('repository-cloned');
        continue;
      }
      if (operation.kind === 'fast-forward') {
        const result = this.applyFastForward(operation.root);
        if (result.kind === 'blocked') return result;
        if (result.kind !== 'applied') throw new Error('SETUP_UPDATE_RESULT_INVALID');
        evidence.push(...result.evidence);
        continue;
      }
      if (operation.kind === 'bun-link') {
        if (this.dependencies.linker === undefined) throw new Error('SETUP_LINKER_REQUIRED');
        evidence.push(this.dependencies.linker.link(operation.root));
        continue;
      }
      if (this.dependencies.shell === undefined) throw new Error('SETUP_SHELL_REQUIRED');
      evidence.push(this.dependencies.shell.reconcile(operation.root));
    }
    return { kind: 'applied', root: plan.target, evidence };
  }

  applyUpdate(): UpdateResult {
    const planned = this.planUpdate();
    if (planned.kind !== 'ready') return planned;
    return this.applyFastForward(planned.root);
  }

  private target(): string {
    return join(this.dependencies.home, 'repos', 'mzsh');
  }

  private updateOperations(root: string): SetupOperationsResult {
    const safety = inspectRepositorySafety(root, this.dependencies.git);
    if (safety.kind === 'blocked') return safety;
    if (!this.dependencies.git.canFastForward(root))
      return { kind: 'blocked', code: 'REPOSITORY_DIVERGED' };
    return [{ kind: 'fast-forward', root }];
  }

  private applyFastForward(root: string): UpdateResult {
    const safety = inspectRepositorySafety(root, this.dependencies.git);
    if (safety.kind === 'blocked') return safety;
    if (!this.dependencies.git.canFastForward(root))
      return { kind: 'blocked', code: 'REPOSITORY_DIVERGED' };
    this.dependencies.git.fetch(root);
    const fetchedSafety = inspectRepositorySafety(root, this.dependencies.git);
    if (fetchedSafety.kind === 'blocked') return fetchedSafety;
    if (!this.dependencies.git.canFastForward(root))
      return { kind: 'blocked', code: 'REPOSITORY_DIVERGED' };
    if (fetchedSafety.behind === 0)
      return { kind: 'applied', root, evidence: ['repository-current'] };
    this.dependencies.git.pullFastForward(root);
    return { kind: 'applied', root, evidence: ['repository-fast-forwarded'] };
  }
}

export function setupPlanFingerprint(plan: object): string {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}
