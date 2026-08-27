import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  SetupService,
  type BunLinker,
  type ShellReconciler,
  type SetupGit,
  type SetupRepository,
} from '../../../src/application/setup-service';
import { runMzshCli, type RunMzshCliDependencies } from '../../../src/cli/run-cli';

const fixtures: string[] = [];

function fixture(): string {
  const parent = join(import.meta.dir, '.fixtures');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'setup-cli-'));
  fixtures.push(root);
  return root;
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

class FakeRepository implements SetupRepository {
  constructor(private readonly present = false) {}

  inspect(root: string) {
    if (this.present) {
      return {
        kind: 'present' as const,
        root,
        packageName: 'mzsh' as const,
        portableEntrypoint: join(root, 'portable/zsh/init.zsh'),
      };
    }
    return { kind: 'missing' as const, root, reason: 'root-absent' as const };
  }
}

class FakeGit implements SetupGit {
  clones = 0;
  fetches = 0;

  statusPorcelain(_root: string): { status: number; output: string } {
    return { status: 0, output: '' };
  }

  aheadBehind(_root: string): { status: number; output: string } {
    return { status: 0, output: '0\t0\n' };
  }

  canFastForward(_root: string): boolean {
    return true;
  }

  fetch(_root: string): void {
    this.fetches += 1;
  }

  pullFastForward(_root: string): void {}

  clone(_source: string, _target: string): void {
    this.clones += 1;
  }
}

class FakeLinker implements BunLinker {
  links = 0;

  link(_root: string): string {
    this.links += 1;
    return 'bun-link-created';
  }
}

class FakeShell implements ShellReconciler {
  reconciliations = 0;

  reconcile(_root: string): string {
    this.reconciliations += 1;
    return 'shell-reconciled';
  }
}

function dependencies(
  root: string,
  repositoryPresent = false
): {
  dependencies: RunMzshCliDependencies;
  git: FakeGit;
  linker: FakeLinker;
  shell: FakeShell;
  output: string[];
} {
  const git = new FakeGit();
  const linker = new FakeLinker();
  const shell = new FakeShell();
  const output: string[] = [];
  return {
    git,
    linker,
    shell,
    output,
    dependencies: {
      home: join(root, 'home'),
      xdgConfig: join(root, 'config'),
      xdgCache: join(root, 'cache'),
      repositoryRoot: join(root, 'repository'),
      write: (message) => output.push(message),
      reviewedPlanId: () => '4b5fd2fd-2f80-4ce9-a8f3-5c12dfacbe49',
      setup: new SetupService({
        home: join(root, 'home'),
        repository: new FakeRepository(repositoryPresent),
        git,
        linker,
        shell,
      }),
    },
  };
}

test('requires a reviewed setup plan before any lifecycle mutation', () => {
  const root = fixture();
  const state = dependencies(root);

  expect(runMzshCli(['setup'], state.dependencies)).toBe(0);
  expect(state.git.clones).toBe(0);
  const reviewed = JSON.parse(state.output[0] ?? '') as { reviewedPlanId: string; target?: string };
  expect(reviewed.target).toBeUndefined();
  expect(runMzshCli(['setup', '--apply'], state.dependencies)).toBe(1);
  expect(state.git.clones).toBe(0);
  expect(
    runMzshCli(
      ['setup', '--apply', '--plan-id', reviewed.reviewedPlanId, '--confirm', 'APPLY'],
      state.dependencies
    )
  ).toBe(0);
  expect(state.git.clones).toBe(1);
  expect(state.linker.links).toBe(1);
  expect(state.shell.reconciliations).toBe(1);
  expect(state.output.join('\n')).not.toContain(join(root, 'home'));
});

test('rejects an incomplete setup apply without reading setup or history dependencies', () => {
  const output: string[] = [];
  const dependencies: RunMzshCliDependencies = {
    get home(): string {
      throw new Error('home should not be read');
    },
    get xdgConfig(): string {
      throw new Error('config should not be read');
    },
    get xdgCache(): string {
      throw new Error('cache should not be read');
    },
    get repositoryRoot(): string {
      throw new Error('repository should not be read');
    },
    write: (message) => output.push(message),
  };

  expect(runMzshCli(['setup', '--apply'], dependencies)).toBe(1);
  expect(output).toEqual(['MZSH_PLAN_CONFIRMATION_REQUIRED']);
});

test('uses only read-only lookup when an unknown reviewed setup plan is applied', () => {
  const root = fixture();
  const state = dependencies(root);

  expect(
    runMzshCli(
      [
        'setup',
        '--apply',
        '--plan-id',
        '4b5fd2fd-2f80-4ce9-a8f3-5c12dfacbe50',
        '--confirm',
        'APPLY',
      ],
      state.dependencies
    )
  ).toBe(1);
  expect(existsSync(join(root, 'cache', 'mzsh', 'history', 'history.sqlite'))).toBe(false);
  expect(state.git.clones).toBe(0);
});

test('requires a reviewed update plan before fetching the managed checkout', () => {
  const state = dependencies(fixture(), true);

  expect(runMzshCli(['update'], state.dependencies)).toBe(0);
  const reviewed = JSON.parse(state.output[0] ?? '') as { reviewedPlanId: string; action: string };
  expect(reviewed.action).toBe('update');
  expect(runMzshCli(['update', '--apply'], state.dependencies)).toBe(1);
  expect(state.git.fetches).toBe(0);
  expect(
    runMzshCli(
      ['update', '--apply', '--plan-id', reviewed.reviewedPlanId, '--confirm', 'APPLY'],
      state.dependencies
    )
  ).toBe(0);
  expect(state.git.fetches).toBe(1);
});
