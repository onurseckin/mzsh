import { spawnSync } from 'node:child_process';
import type { RepositorySafetyGit } from '../application/repository-safety';

export interface GitCommandResult {
  status: number;
  output: string;
}

export interface GitCommandRunner {
  run(argv: readonly string[]): GitCommandResult;
}

class FixedArgvGitRunner implements GitCommandRunner {
  run(argv: readonly string[]): GitCommandResult {
    const command = argv[0];
    if (command === undefined) return { status: 1, output: '' };
    const result = spawnSync(command, argv.slice(1), {
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
  }
}

export class GitClient implements RepositorySafetyGit {
  constructor(private readonly runner: GitCommandRunner = new FixedArgvGitRunner()) {}

  statusPorcelain(root: string): GitCommandResult {
    return this.runner.run(['git', '-C', root, 'status', '--porcelain']);
  }

  aheadBehind(root: string): GitCommandResult {
    return this.runner.run([
      'git',
      '-C',
      root,
      'rev-list',
      '--left-right',
      '--count',
      '@{upstream}...HEAD',
    ]);
  }

  canFastForward(root: string): boolean {
    return (
      this.runner.run(['git', '-C', root, 'merge-base', '--is-ancestor', 'HEAD', '@{upstream}'])
        .status === 0
    );
  }

  fetch(root: string): void {
    this.requireSuccess(this.runner.run(['git', '-C', root, 'fetch', 'origin']));
  }

  pullFastForward(root: string): void {
    this.requireSuccess(this.runner.run(['git', '-C', root, 'pull', '--ff-only']));
  }

  clone(source: string, target: string): void {
    this.requireSuccess(this.runner.run(['git', 'clone', '--', source, target]));
  }

  private requireSuccess(result: GitCommandResult): void {
    if (result.status !== 0) throw new Error('GIT_OPERATION_FAILED');
  }
}
