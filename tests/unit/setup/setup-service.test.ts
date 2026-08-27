import { describe, expect, test } from 'bun:test';
import {
  SetupService,
  type BunLinker,
  type ShellReconciler,
  type SetupGit,
  type SetupRepository,
} from '../../../src/application/setup-service';

class FakeGit implements SetupGit {
  readonly calls: string[][] = [];

  constructor(
    private readonly status = '',
    private relation = '0\t0\n',
    private readonly fastForward = true
  ) {}

  statusPorcelain(_root: string): { status: number; output: string } {
    this.calls.push(['status', '--porcelain']);
    return { status: 0, output: this.status };
  }

  aheadBehind(_root: string): { status: number; output: string } {
    this.calls.push(['rev-list', '--left-right', '--count', '@{upstream}...HEAD']);
    return { status: 0, output: this.relation };
  }

  canFastForward(_root: string): boolean {
    this.calls.push(['merge-base', '--is-ancestor', 'HEAD', '@{upstream}']);
    return this.fastForward;
  }

  fetch(_root: string): void {
    this.calls.push(['fetch', 'origin']);
  }

  pullFastForward(_root: string): void {
    this.calls.push(['pull', '--ff-only']);
  }

  clone(_source: string, _target: string): void {
    this.calls.push(['clone']);
  }

  setRelation(value: string): void {
    this.relation = value;
  }
}

class FakeRepository implements SetupRepository {
  constructor(private readonly present = true) {}

  inspect(root: string) {
    return this.present
      ? {
          kind: 'present' as const,
          root,
          packageName: 'mzsh' as const,
          portableEntrypoint: `${root}/portable/zsh/init.zsh`,
        }
      : { kind: 'missing' as const, root, reason: 'root-absent' as const };
  }
}

class FakeLinker implements BunLinker {
  readonly roots: string[] = [];

  link(root: string): string {
    this.roots.push(root);
    return 'bun-link-created';
  }
}

class FakeShell implements ShellReconciler {
  readonly roots: string[] = [];

  reconcile(root: string): string {
    this.roots.push(root);
    return 'shell-reconciled';
  }
}

describe('setup service', () => {
  test('stops before fetch when repository has unpushed commits', () => {
    const git = new FakeGit('', '0\t1\n');
    const service = new SetupService({
      home: '/home/fixture',
      repository: new FakeRepository(),
      git,
    });

    expect(service.planUpdate()).toMatchObject({
      kind: 'blocked',
      code: 'REPOSITORY_UNPUSHED',
    });
    expect(git.calls).not.toContainEqual(['fetch', 'origin']);
  });

  test('plans clone, global link, and shell reconciliation for an absent checkout', () => {
    const service = new SetupService({
      home: '/home/fixture',
      repository: new FakeRepository(false),
      git: new FakeGit(),
    });

    expect(service.planSetup()).toEqual({
      kind: 'ready',
      plan: expect.objectContaining({
        target: '/home/fixture/repos/mzsh',
        operations: [
          expect.objectContaining({ kind: 'clone' }),
          expect.objectContaining({ kind: 'bun-link' }),
          expect.objectContaining({ kind: 'shell-reconcile' }),
        ],
      }),
    });
  });

  test('plans a fast-forward update only after clean safety checks', () => {
    const git = new FakeGit('', '1\t0\n');
    const service = new SetupService({
      home: '/home/fixture',
      repository: new FakeRepository(),
      git,
    });

    expect(service.planUpdate()).toEqual({
      kind: 'ready',
      root: '/home/fixture/repos/mzsh',
      operations: [{ kind: 'fast-forward', root: '/home/fixture/repos/mzsh' }],
    });
    expect(git.calls).not.toContainEqual(['fetch', 'origin']);
  });

  test('fetches after a clean current tracking state before deciding no update is needed', () => {
    const git = new FakeGit('', '0\t0\n');
    const service = new SetupService({
      home: '/home/fixture',
      repository: new FakeRepository(),
      git,
    });
    const originalFetch = git.fetch.bind(git);
    git.fetch = (root: string): void => {
      originalFetch(root);
      git.setRelation('1\t0\n');
    };

    expect(service.applyUpdate()).toEqual({
      kind: 'applied',
      root: '/home/fixture/repos/mzsh',
      evidence: ['repository-fast-forwarded'],
    });
    expect(git.calls).toContainEqual(['fetch', 'origin']);
    expect(git.calls).toContainEqual(['pull', '--ff-only']);
  });

  test('applies each reviewed setup operation in its serialized order', () => {
    const git = new FakeGit();
    const linker = new FakeLinker();
    const shell = new FakeShell();
    const service = new SetupService({
      home: '/home/fixture',
      repository: new FakeRepository(false),
      git,
      linker,
      shell,
    });
    const planned = service.planSetup();
    if (planned.kind !== 'ready') throw new Error('SETUP_PLAN_REQUIRED');

    expect(service.applySetup(planned.plan)).toEqual({
      kind: 'applied',
      root: '/home/fixture/repos/mzsh',
      evidence: ['repository-cloned', 'bun-link-created', 'shell-reconciled'],
    });
    expect(git.calls).toEqual([['clone']]);
    expect(linker.roots).toEqual(['/home/fixture/repos/mzsh']);
    expect(shell.roots).toEqual(['/home/fixture/repos/mzsh']);
  });
});
