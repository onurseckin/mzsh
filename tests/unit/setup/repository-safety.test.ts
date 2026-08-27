import { describe, expect, test } from 'bun:test';
import {
  inspectRepositorySafety,
  type RepositorySafetyGit,
} from '../../../src/application/repository-safety';
import { GitClient, type GitCommandRunner } from '../../../src/infrastructure/git-client';

class FakeGit implements RepositorySafetyGit {
  readonly calls: string[][] = [];

  constructor(
    private readonly status: string,
    private readonly relation: string
  ) {}

  statusPorcelain(_root: string): { status: number; output: string } {
    this.calls.push(['status', '--porcelain']);
    return { status: 0, output: this.status };
  }

  aheadBehind(_root: string): { status: number; output: string } {
    this.calls.push(['rev-list', '--left-right', '--count', '@{upstream}...HEAD']);
    return { status: 0, output: this.relation };
  }
}

describe('repository safety', () => {
  test('blocks a dirty repository before any remote operation', () => {
    const git = new FakeGit(' M portable/zsh/init.zsh\n', '0\t0\n');

    expect(inspectRepositorySafety('/work/mzsh', git)).toEqual({
      kind: 'blocked',
      code: 'REPOSITORY_DIRTY',
    });
    expect(git.calls).toEqual([['status', '--porcelain']]);
  });

  test('blocks a repository with local commits that are not pushed', () => {
    const git = new FakeGit('', '0\t1\n');

    expect(inspectRepositorySafety('/work/mzsh', git)).toEqual({
      kind: 'blocked',
      code: 'REPOSITORY_UNPUSHED',
    });
  });

  test('blocks a repository with both remote and local commits', () => {
    const git = new FakeGit('', '1\t1\n');

    expect(inspectRepositorySafety('/work/mzsh', git)).toEqual({
      kind: 'blocked',
      code: 'REPOSITORY_DIVERGED',
    });
  });

  test('accepts a clean repository that can be fast-forwarded', () => {
    const git = new FakeGit('', '2\t0\n');

    expect(inspectRepositorySafety('/work/mzsh', git)).toEqual({
      kind: 'safe',
      behind: 2,
    });
  });

  test('uses fixed Git argv for each lifecycle command', () => {
    const calls: string[][] = [];
    const runner: GitCommandRunner = {
      run(argv) {
        calls.push([...argv]);
        return { status: 0, output: '0\t0\n' };
      },
    };
    const git = new GitClient(runner);

    git.statusPorcelain('/work/mzsh');
    git.aheadBehind('/work/mzsh');
    git.canFastForward('/work/mzsh');
    git.fetch('/work/mzsh');
    git.pullFastForward('/work/mzsh');
    git.clone('https://example.invalid/mzsh.git', '/work/mzsh');

    expect(calls).toEqual([
      ['git', '-C', '/work/mzsh', 'status', '--porcelain'],
      ['git', '-C', '/work/mzsh', 'rev-list', '--left-right', '--count', '@{upstream}...HEAD'],
      ['git', '-C', '/work/mzsh', 'merge-base', '--is-ancestor', 'HEAD', '@{upstream}'],
      ['git', '-C', '/work/mzsh', 'fetch', 'origin'],
      ['git', '-C', '/work/mzsh', 'pull', '--ff-only'],
      ['git', 'clone', '--', 'https://example.invalid/mzsh.git', '/work/mzsh'],
    ]);
  });
});
