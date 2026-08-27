import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AdoptionPlan } from '../../src/domain/adoption';
import { renderStableLoader } from '../../src/application/render-stable-loader';
import {
  ZshPreflight,
  type ZshPreflightDependencies,
} from '../../src/infrastructure/zsh-preflight';

const fixtures: string[] = [];
afterEach(() =>
  fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }))
);

function plan(repository: string): AdoptionPlan {
  return {
    schema: 'mzsh.adoption-plan/v1',
    id: 'test',
    home: '/isolated',
    repository,
    config: '/isolated/.config',
    stateDirectory: '/isolated/state',
    backupDirectory: '/isolated/backups',
    privatePath: '/isolated/private',
    currentLink: '/isolated/current',
    shimLink: '/isolated/shims',
    entrypoint: join(repository, 'portable', 'zsh', 'init.zsh'),
    repositoryPreconditions: { entrypointHash: '', packageHash: '' },
    moduleOrder: [],
    targets: [],
    mutations: [],
    repositoryMetadata: { version: 'test', commit: null },
  };
}

describe('stable loader rendering', () => {
  test('uses the shared quiet interactive and login boundaries', () => {
    const interactive = renderStableLoader('.zshrc');
    expect(interactive).toContain('[[ -o interactive ]] || return 0');
    expect(renderStableLoader('.zprofile')).toContain('[[ -o login ]] || return 0');
    expect(renderStableLoader('.zshenv')).toContain('mzsh-managed-loader');
    expect(interactive).toContain('p10k-instant-prompt-${(%):-%n}.zsh');
    expect(interactive.indexOf('p10k-instant-prompt')).toBeLessThan(
      interactive.indexOf('/mzsh/current/loaders/zshrc.zsh')
    );
    expect(interactive).toContain('[[ -r $mzsh_instant_prompt && ! -L $mzsh_instant_prompt ]]');
  });

  test('renders each stable loader as a closed managed program', () => {
    expect(renderStableLoader('.zshrc')).toBe(
      '# mzsh-managed-loader\n' +
        '[[ -o interactive ]] || return 0\n' +
        'typeset mzsh_instant_prompt="${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"\n' +
        'if [[ -r $mzsh_instant_prompt && ! -L $mzsh_instant_prompt ]]; then\n' +
        '  source "$mzsh_instant_prompt"\nfi\n' +
        'unset mzsh_instant_prompt\n' +
        'if [[ ! -r "${XDG_CONFIG_HOME:-$HOME/.config}/mzsh/current/loaders/zshrc.zsh" ]]; then\n' +
        '  [[ -o interactive ]] && print -u2 -- "mzsh: managed loader unavailable"\n' +
        '  return 0\nfi\n' +
        'source "${XDG_CONFIG_HOME:-$HOME/.config}/mzsh/current/loaders/zshrc.zsh"\n'
    );
  });

  test('syntax-checks an isolated portable checkout and fails closed for invalid syntax', () => {
    const root = mkdtempSync(join(tmpdir(), 'mzsh-preflight-test-'));
    fixtures.push(root);
    const portable = join(root, 'portable', 'zsh');
    mkdirSync(portable, { recursive: true });
    writeFileSync(join(portable, 'init.zsh'), 'return 0\n');
    expect(new ZshPreflight().preflight(plan(root))).toEqual({ kind: 'passed' });
    writeFileSync(join(portable, 'broken.zsh'), 'if then\n');
    expect(new ZshPreflight().preflight(plan(root))).toEqual({
      kind: 'failed',
      code: 'syntax-invalid',
    });
  });

  test('uses only generated-home paths, fixed source arguments, and cleans up on success', () => {
    const root = mkdtempSync(join(tmpdir(), 'mzsh-preflight-test-'));
    fixtures.push(root);
    const portable = join(root, 'portable', 'zsh');
    mkdirSync(portable, { recursive: true });
    writeFileSync(join(portable, 'init.zsh'), 'return 0\n');
    const isolated = mkdtempSync(join(tmpdir(), 'mzsh-preflight-isolated-'));
    const calls: Array<{ args: readonly string[]; environment: Readonly<Record<string, string>> }> =
      [];
    let removed = false;
    const dependencies: ZshPreflightDependencies = {
      createTemporaryHome: () => isolated,
      removeTemporaryHome: (path) => {
        removed = path === isolated;
        rmSync(path, { recursive: true, force: true });
      },
      spawn: (_command, args, environment) => {
        calls.push({ args, environment });
        return { status: 0 };
      },
    };
    expect(new ZshPreflight(dependencies).preflight(plan(root))).toEqual({ kind: 'passed' });
    expect(calls).toHaveLength(7);
    expect(
      calls.every(
        (call) =>
          call.environment.HOME === isolated &&
          call.environment.ZDOTDIR === isolated &&
          call.environment.PATH === '/usr/bin:/bin:/usr/sbin:/sbin'
      )
    ).toBe(true);
    expect(
      calls
        .slice(-3)
        .every(
          (call) => call.args.includes('source "$1"') && !call.args.some((arg) => arg.includes('~'))
        )
    ).toBe(true);
    expect(removed).toBe(true);
  });

  test('fails closed and removes the generated home when command output resembles a credential assignment', () => {
    const root = mkdtempSync(join(tmpdir(), 'mzsh-preflight-test-'));
    fixtures.push(root);
    mkdirSync(join(root, 'portable', 'zsh'), { recursive: true });
    writeFileSync(join(root, 'portable', 'zsh', 'init.zsh'), 'return 0\n');
    const isolated = mkdtempSync(join(tmpdir(), 'mzsh-preflight-isolated-'));
    let removed = false;
    const dependencies: ZshPreflightDependencies = {
      createTemporaryHome: () => isolated,
      removeTemporaryHome: (path) => {
        removed = path === isolated;
        rmSync(path, { recursive: true, force: true });
      },
      spawn: () => ({ status: 0, stdout: 'API_TOKEN=inert-placeholder' }),
    };
    expect(new ZshPreflight(dependencies).preflight(plan(root))).toEqual({
      kind: 'failed',
      code: 'syntax-invalid',
    });
    expect(removed).toBe(true);
  });

  test('fails closed for compound credential assignments in stdout or stderr', () => {
    for (const result of [
      { status: 0, stdout: 'DB_PASSWORD_HASH=inert-placeholder' },
      { status: 0, stderr: 'SERVICE_CREDENTIALS=inert-placeholder' },
    ]) {
      const root = mkdtempSync(join(tmpdir(), 'mzsh-preflight-test-'));
      fixtures.push(root);
      mkdirSync(join(root, 'portable', 'zsh'), { recursive: true });
      writeFileSync(join(root, 'portable', 'zsh', 'init.zsh'), 'return 0\n');
      const isolated = mkdtempSync(join(tmpdir(), 'mzsh-preflight-isolated-'));
      const dependencies: ZshPreflightDependencies = {
        createTemporaryHome: () => isolated,
        removeTemporaryHome: (path) => rmSync(path, { recursive: true, force: true }),
        spawn: () => result,
      };
      expect(new ZshPreflight(dependencies).preflight(plan(root))).toEqual({
        kind: 'failed',
        code: 'syntax-invalid',
      });
    }
  });

  test('fails closed without cleanup when generated-home creation fails', () => {
    let cleanupCalls = 0;
    const dependencies: ZshPreflightDependencies = {
      createTemporaryHome: () => {
        throw new Error('injected');
      },
      removeTemporaryHome: () => {
        cleanupCalls += 1;
      },
      spawn: () => ({ status: 0 }),
    };
    expect(new ZshPreflight(dependencies).preflight(plan('/unread'))).toEqual({
      kind: 'failed',
      code: 'isolated-startup-failed',
    });
    expect(cleanupCalls).toBe(0);
  });

  test('fails closed when generated-home cleanup fails', () => {
    const root = mkdtempSync(join(tmpdir(), 'mzsh-preflight-test-'));
    fixtures.push(root);
    mkdirSync(join(root, 'portable', 'zsh'), { recursive: true });
    writeFileSync(join(root, 'portable', 'zsh', 'init.zsh'), 'return 0\n');
    const isolated = mkdtempSync(join(tmpdir(), 'mzsh-preflight-isolated-'));
    fixtures.push(isolated);
    const dependencies: ZshPreflightDependencies = {
      createTemporaryHome: () => isolated,
      removeTemporaryHome: () => {
        throw new Error('injected');
      },
      spawn: () => ({ status: 0 }),
    };
    expect(new ZshPreflight(dependencies).preflight(plan(root))).toEqual({
      kind: 'failed',
      code: 'isolated-startup-failed',
    });
  });
});
