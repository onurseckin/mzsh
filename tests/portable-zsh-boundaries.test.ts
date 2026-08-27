import { afterEach, describe, expect, test } from 'bun:test';
import { chmodSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PORTABLE_INTERACTIVE_MODULE_ORDER,
  PORTABLE_LOGIN_MODULE_ORDER,
} from '../src/domain/portable-module-order';
import * as helpers from './portable-zsh-test-helpers';

const {
  repositoryRoot,
  entrypoint,
  zshPath,
  portableEnvironment,
  createFixture,
  makeDirectory,
  runEntrypoint,
  outputOf,
  errorOutputOf,
} = helpers;
afterEach(helpers.cleanupFixtures);

describe('portable Zsh boundaries and private state', () => {
  test('loads only permission-restricted local private overrides', () => {
    const fixture = createFixture();
    makeDirectory(fixture, 'home');
    makeDirectory(fixture, 'system');
    const privateFile = join(fixture, 'private.zsh');
    writeFileSync(privateFile, 'export MZSH_PRIVATE_VALUE=loaded\n');
    chmodSync(privateFile, 0o600);

    const result = runEntrypoint(fixture, privateFile);

    expect(result.exitCode).toBe(0);
    expect(outputOf(result)).toContain('PRIVATE=loaded\n');
  });

  test('rejects insecure local private overrides without emitting output by default', () => {
    const fixture = createFixture();
    makeDirectory(fixture, 'home');
    makeDirectory(fixture, 'system');
    const privateFile = join(fixture, 'private.zsh');
    writeFileSync(privateFile, 'export MZSH_PRIVATE_VALUE=leaked\n');
    chmodSync(privateFile, 0o644);

    const result = runEntrypoint(fixture, privateFile);

    expect(result.exitCode).toBe(0);
    expect(outputOf(result)).toContain('PRIVATE=absent\n');
    expect(errorOutputOf(result)).toBe('');
  });

  test('rejects a symlinked private override even when its target is owner-only', () => {
    const fixture = createFixture();
    makeDirectory(fixture, 'home');
    makeDirectory(fixture, 'system');
    const privateTarget = join(fixture, 'private-target.zsh');
    const privateLink = join(fixture, 'private-link.zsh');
    writeFileSync(privateTarget, 'export MZSH_PRIVATE_VALUE=leaked\n');
    chmodSync(privateTarget, 0o600);
    symlinkSync(privateTarget, privateLink);

    const result = runEntrypoint(fixture, privateLink);

    expect(result.exitCode).toBe(0);
    expect(outputOf(result)).toContain('PRIVATE=absent\n');
  });

  test('rejects a private override when stat reports a foreign owner', () => {
    const fixture = createFixture();
    makeDirectory(fixture, 'home');
    makeDirectory(fixture, 'system');
    const privateFile = join(fixture, 'private.zsh');
    const fakeBin = makeDirectory(fixture, 'fake-bin');
    const fakeStat = join(fakeBin, 'stat');
    writeFileSync(privateFile, 'export MZSH_PRIVATE_VALUE=leaked\n');
    chmodSync(privateFile, 0o600);
    writeFileSync(
      fakeStat,
      [
        '#!/bin/sh',
        'if [ "$1" = "-f" ] && [ "$2" = "%Lp" ]; then printf "600\\n"; exit 0; fi',
        'if [ "$1" = "-f" ] && [ "$2" = "%u" ]; then printf "99999\\n"; exit 0; fi',
        'exit 1',
      ].join('\n')
    );
    chmodSync(fakeStat, 0o755);

    const script = [
      'function compinit() { return 0 }',
      'source "$MZSH_ENTRYPOINT"; source_status=$?',
      'print -r -- "SOURCE_STATUS=$source_status"',
      'print -r -- "PRIVATE=${MZSH_PRIVATE_VALUE:-absent}"',
    ].join('\n');
    const result = Bun.spawnSync([zshPath, '-fc', script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, 'home'),
        PATH: `${fakeBin}:${join(fixture, 'system')}:/usr/bin:/bin`,
        FPATH: '',
        MZSH_ENTRYPOINT: entrypoint,
        BUN_INSTALL: '',
        NVM_DIR: '',
        CARGO_HOME: join(fixture, 'missing-cargo'),
        ANDROID_HOME: '',
        ANDROID_SDK_ROOT: '',
        MZSH_PRIVATE_ZSH: privateFile,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(0);
    expect(errorOutputOf(result)).toBe('');
    expect(outputOf(result)).toContain('SOURCE_STATUS=0\n');
    expect(outputOf(result)).toContain('PRIVATE=absent\n');
  });

  test('removes the private permission helper after initialization', () => {
    const fixture = createFixture();
    makeDirectory(fixture, 'home');
    makeDirectory(fixture, 'system');

    const script = [
      'source "$MZSH_ENTRYPOINT"; source_status=$?',
      'print -r -- "SOURCE_STATUS=$source_status"',
      'print -r -- "PRIVATE_HELPER=${+functions[mzsh_private_mode]}"',
    ].join('\n');
    const result = Bun.spawnSync([zshPath, '-fc', script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, 'home'),
        PATH: `${join(fixture, 'system')}:/usr/bin:/bin`,
        MZSH_ENTRYPOINT: entrypoint,
        BUN_INSTALL: '',
        NVM_DIR: '',
        CARGO_HOME: join(fixture, 'missing-cargo'),
        ANDROID_HOME: '',
        ANDROID_SDK_ROOT: '',
        MZSH_PRIVATE_ZSH: join(fixture, 'missing-private.zsh'),
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(0);
    expect(outputOf(result)).toContain('SOURCE_STATUS=0\n');
    expect(outputOf(result)).toContain('PRIVATE_HELPER=0\n');
  });

  test('provides quiet syntax-valid loaders for all shell entrypoint contexts', () => {
    const fixture = createFixture();
    makeDirectory(fixture, 'home');
    makeDirectory(fixture, 'system');

    for (const [loaderName, expectedContext, shellFlags] of [
      ['zshenv.zsh', 'all-shell', '-dfc'],
      ['zprofile.zsh', 'login', '-dflc'],
      ['zshrc.zsh', 'interactive', '-dfic'],
    ]) {
      const loader = join(repositoryRoot, 'portable', 'zsh', 'loaders', loaderName);
      const script = [
        'source "$MZSH_LOADER"; source_status=$?',
        'print -r -- "SOURCE_STATUS=$source_status"',
        'print -r -- "CONTEXT=${MZSH_PORTABLE_ZSH_LOADER_CONTEXT:-absent}"',
      ].join('\n');
      const result = Bun.spawnSync([zshPath, shellFlags, script], {
        cwd: fixture,
        env: {
          ...portableEnvironment(),
          HOME: join(fixture, 'home'),
          PATH: `${join(fixture, 'system')}:/usr/bin:/bin`,
          MZSH_LOADER: loader,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });

      expect(result.exitCode).toBe(0);
      expect(errorOutputOf(result)).toBe('');
      expect(outputOf(result)).toContain('SOURCE_STATUS=0\n');
      expect(outputOf(result)).toContain(`CONTEXT=${expectedContext}\n`);
    }
  });

  test('keeps TypeScript and Zsh module orders identical', () => {
    const manifest = readFileSync(join(repositoryRoot, 'portable', 'zsh', 'manifest.zsh'), 'utf8');
    const loginManifest = readFileSync(
      join(repositoryRoot, 'portable', 'zsh', 'login-manifest.zsh'),
      'utf8'
    );
    const modulesIn = (source: string, arrayName: string): string[] => {
      const match = source.match(new RegExp(`${arrayName}=\\(\\n([\\s\\S]*?)\\n\\)`));
      return match?.[1]?.trim().split(/\s+/) ?? [];
    };
    const interactiveModules = [
      ...modulesIn(manifest, 'mzsh_pre_framework_modules'),
      ...modulesIn(manifest, 'mzsh_framework_modules'),
    ];
    const loginModules = modulesIn(loginManifest, 'mzsh_login_modules');

    expect(interactiveModules).toEqual([...PORTABLE_INTERACTIVE_MODULE_ORDER]);
    expect(loginModules).toEqual([...PORTABLE_LOGIN_MODULE_ORDER]);
  });

  test('loads login paths before interactive behavior and remains idempotent', () => {
    const fixture = createFixture();
    for (const directory of [
      'home',
      'system',
      'shims',
      'homebrew/bin',
      'homebrew/sbin',
      'bun/bin',
      'cargo/bin',
    ]) {
      makeDirectory(fixture, directory);
    }

    const script = [
      'function compinit() { return 0 }',
      'source "$MZSH_ZPROFILE" || exit 1',
      'print -r -- "LOGIN=${(j:,:)MZSH_LOGIN_LOADED_MODULES}"',
      'source "$MZSH_ZSHRC" || exit 1',
      'source "$MZSH_ZSHRC" || exit 1',
      'print -r -- "INTERACTIVE=${(j:,:)MZSH_LOADED_MODULES}"',
      'print -r -- "PATH=$PATH"',
    ].join('\n');
    const result = Bun.spawnSync([zshPath, '-dfl', '-i', '-c', script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, 'home'),
        PATH: `${join(fixture, 'system')}:${join(fixture, 'system')}:/usr/bin:/bin`,
        MZSH_ZPROFILE: join(repositoryRoot, 'portable', 'zsh', 'loaders', 'zprofile.zsh'),
        MZSH_ZSHRC: join(repositoryRoot, 'portable', 'zsh', 'loaders', 'zshrc.zsh'),
        MZSH_COMMAND_SHIM_DIR: join(fixture, 'shims'),
        MZSH_HOMEBREW_PREFIX: join(fixture, 'homebrew'),
        MZSH_MACPORTS_PREFIX: '',
        BUN_INSTALL: join(fixture, 'bun'),
        NVM_DIR: '',
        CARGO_HOME: join(fixture, 'cargo'),
        ANDROID_HOME: '',
        ANDROID_SDK_ROOT: '',
        PNPM_HOME: '',
        MZSH_PNPM_GLOBAL_BIN: '',
        RUBY_HOME: '',
        PYTHONUSERBASE: '',
        GOPATH: '',
        JAVA_HOME: '',
        MZSH_OH_MY_ZSH_ROOT: '',
        MZSH_PRIVATE_ZSH: join(fixture, 'missing-private.zsh'),
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(0);
    expect(errorOutputOf(result)).toBe('');
    expect(outputOf(result)).toContain(`LOGIN=${PORTABLE_LOGIN_MODULE_ORDER.join(',')}\n`);
    expect(outputOf(result)).toContain(
      `INTERACTIVE=${PORTABLE_INTERACTIVE_MODULE_ORDER.join(',')}\n`
    );
    const pathLine = outputOf(result)
      .split('\n')
      .find((line) => line.startsWith('PATH='));
    expect(
      pathLine
        ?.replace(/^PATH=/, '')
        .split(':')
        .filter((entry) => entry === join(fixture, 'shims'))
    ).toHaveLength(1);
    expect(pathLine?.startsWith(`PATH=${join(fixture, 'shims')}:`)).toBe(true);
  });

  test('emits observability only when explicitly enabled', () => {
    const fixture = createFixture();
    makeDirectory(fixture, 'home');
    makeDirectory(fixture, 'system');
    const privateFile = join(fixture, 'private.zsh');
    writeFileSync(privateFile, 'export MZSH_PRIVATE_VALUE=leaked\n');
    chmodSync(privateFile, 0o644);

    const script = 'source "$MZSH_ENTRYPOINT"';
    const result = Bun.spawnSync([zshPath, '-fc', script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, 'home'),
        PATH: `${join(fixture, 'system')}:/usr/bin:/bin`,
        MZSH_ENTRYPOINT: entrypoint,
        MZSH_PRIVATE_ZSH: privateFile,
        MZSH_OBSERVE: '1',
        BUN_INSTALL: '',
        NVM_DIR: '',
        CARGO_HOME: join(fixture, 'missing-cargo'),
        ANDROID_HOME: '',
        ANDROID_SDK_ROOT: '',
        MZSH_OH_MY_ZSH_ROOT: '',
        MZSH_DOCKER_COMPLETION_DIR: '',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(0);
    expect(new TextDecoder().decode(result.stdout)).toBe('');
    expect(errorOutputOf(result)).toContain('mzsh: skipped insecure private override');
  });

  test('keeps secret values out of the portable tree', () => {
    const portableFiles = [
      'init.zsh',
      'manifest.zsh',
      'login-manifest.zsh',
      'modules/path.zsh',
      'modules/homebrew.zsh',
      'modules/bun.zsh',
      'modules/nvm.zsh',
      'modules/rust.zsh',
      'modules/android.zsh',
      'modules/oh-my-zsh.zsh',
      'modules/completion-directories.zsh',
      'modules/completion.zsh',
      'modules/private.zsh',
      'modules/observability.zsh',
      'modules/safety-shims.zsh',
      'modules/macports.zsh',
      'modules/runtime-paths.zsh',
      'modules/prompt-vi.zsh',
      'modules/aliases.zsh',
      'modules/search.zsh',
      'modules/history.zsh',
      'modules/dburl.zsh',
      'modules/ports-manager.zsh',
      'loaders/zshenv.zsh',
      'loaders/zprofile.zsh',
      'loaders/zshrc.zsh',
    ];

    for (const relativePath of portableFiles) {
      const source = readFileSync(join(repositoryRoot, 'portable', 'zsh', relativePath), 'utf8');
      expect(source).not.toMatch(
        /(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|tsec_[A-Za-z0-9_-]{12,})/
      );
    }
  });
});
