import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderStableLoader } from '../application/render-stable-loader';
import { containsSensitiveAssignment } from '../application/sensitive-assignment-policy';
import type { AdoptionPlan } from '../domain/adoption';

export type PreflightResult =
  | { kind: 'passed' }
  | { kind: 'failed'; code: 'syntax-invalid' | 'isolated-startup-failed' };
export interface ZshSpawnResult {
  status: number | null | undefined;
  stdout?: string;
  stderr?: string;
}
export interface ZshPreflightDependencies {
  createTemporaryHome(): string;
  removeTemporaryHome(path: string): void;
  spawn(
    command: string,
    args: readonly string[],
    environment: Readonly<Record<string, string>>
  ): ZshSpawnResult;
}

function portableZshFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? portableZshFiles(join(root, entry.name))
      : entry.name.endsWith('.zsh')
        ? [join(root, entry.name)]
        : []
  );
}

function defaultDependencies(): ZshPreflightDependencies {
  return {
    createTemporaryHome: () => mkdtempSync(join(tmpdir(), 'mzsh-preflight-')),
    removeTemporaryHome: (path) => rmSync(path, { recursive: true, force: true }),
    spawn: (command, args, environment) => {
      const result = spawnSync(command, args, {
        shell: false,
        env: environment,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return {
        status: result.status,
        stdout: result.stdout ?? undefined,
        stderr: result.stderr ?? undefined,
      };
    },
  };
}

export class ZshPreflight {
  constructor(private readonly dependencies: ZshPreflightDependencies = defaultDependencies()) {}

  preflight(plan: AdoptionPlan): PreflightResult {
    let isolatedHome: string;
    try {
      isolatedHome = this.dependencies.createTemporaryHome();
    } catch {
      return { kind: 'failed', code: 'isolated-startup-failed' };
    }
    let result: PreflightResult;
    try {
      chmodSync(isolatedHome, 0o700);
      const config = join(isolatedHome, '.config');
      const current = join(config, 'mzsh', 'current');
      mkdirSync(join(config, 'mzsh'), { recursive: true, mode: 0o700 });
      symlinkSync(join(plan.repository, 'portable', 'zsh'), current);
      const loaders = ['.zshenv', '.zprofile', '.zshrc'] as const;
      for (const loader of loaders)
        writeFileSync(join(isolatedHome, loader), renderStableLoader(loader), { mode: 0o600 });
      const environment = {
        HOME: isolatedHome,
        ZDOTDIR: isolatedHome,
        XDG_CONFIG_HOME: config,
        XDG_CACHE_HOME: join(isolatedHome, '.cache'),
        PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
      };
      result = { kind: 'passed' };
      for (const target of [
        ...portableZshFiles(join(plan.repository, 'portable', 'zsh')),
        ...loaders.map((loader) => join(isolatedHome, loader)),
      ]) {
        const commandResult = this.dependencies.spawn('/bin/zsh', ['-n', target], environment);
        if (
          commandResult.status !== 0 ||
          containsSensitiveAssignment(
            `${commandResult.stdout ?? ''}\n${commandResult.stderr ?? ''}`
          )
        ) {
          result = { kind: 'failed', code: 'syntax-invalid' };
          break;
        }
      }
      if (result.kind === 'passed') {
        for (const [flag, loader] of [
          ['-df', '.zshenv'],
          ['-dfl', '.zprofile'],
          ['-dfi', '.zshrc'],
        ] as const) {
          const commandResult = this.dependencies.spawn(
            '/bin/zsh',
            [flag, '-c', 'source "$1"', 'mzsh-preflight', join(isolatedHome, loader)],
            environment
          );
          if (
            commandResult.status !== 0 ||
            containsSensitiveAssignment(
              `${commandResult.stdout ?? ''}\n${commandResult.stderr ?? ''}`
            )
          ) {
            result = { kind: 'failed', code: 'isolated-startup-failed' };
            break;
          }
        }
      }
    } catch {
      result = { kind: 'failed', code: 'isolated-startup-failed' };
    }
    try {
      this.dependencies.removeTemporaryHome(isolatedHome);
    } catch {
      return { kind: 'failed', code: 'isolated-startup-failed' };
    }
    return result;
  }
}
