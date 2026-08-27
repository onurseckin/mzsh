import { afterEach, describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PORTABLE_INTERACTIVE_MODULE_ORDER } from '../src/domain/portable-module-order';
import * as helpers from './portable-zsh-test-helpers';

const {
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

describe('portable Zsh runtime and completion', () => {
  test('publishes a stable successful module trace and redacted diagnostics', () => {
    const fixture = createFixture();
    for (const directory of ['home', 'system']) {
      makeDirectory(fixture, directory);
    }

    const script = [
      'function compinit() { return 0 }',
      'source "$MZSH_ENTRYPOINT"',
      'print -r -- "VERSION=$MZSH_PORTABLE_ZSH_VERSION"',
      'print -r -- "TRACE=${(j:,:)MZSH_LOADED_MODULES}"',
      'source "$MZSH_ENTRYPOINT"',
      'print -r -- "TRACE_AFTER_RESOURCE=${(j:,:)MZSH_LOADED_MODULES}"',
    ].join('\n');

    const result = Bun.spawnSync([zshPath, '-fc', script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, 'home'),
        PATH: `${join(fixture, 'system')}:/usr/bin:/bin`,
        MZSH_ENTRYPOINT: entrypoint,
        MZSH_OBSERVE: '1',
        BUN_INSTALL: '',
        NVM_DIR: '',
        CARGO_HOME: join(fixture, 'missing-cargo'),
        ANDROID_HOME: '',
        ANDROID_SDK_ROOT: '',
        MZSH_OH_MY_ZSH_ROOT: '',
        MZSH_DOCKER_COMPLETION_DIR: '',
        MZSH_PRIVATE_ZSH: join(fixture, 'missing-private.zsh'),
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const expectedTrace = PORTABLE_INTERACTIVE_MODULE_ORDER.join(',');
    expect(result.exitCode).toBe(0);
    expect(outputOf(result)).toContain('VERSION=1\n');
    expect(outputOf(result)).toContain(`TRACE=${expectedTrace}\n`);
    expect(outputOf(result)).toContain(`TRACE_AFTER_RESOURCE=${expectedTrace}\n`);
    expect(errorOutputOf(result).match(/^mzsh: module-loaded:[a-z-]+$/gm)).toHaveLength(
      PORTABLE_INTERACTIVE_MODULE_ORDER.length
    );
  });

  test('builds a deduplicated PATH in explicit application and shim precedence', () => {
    const fixture = createFixture();
    for (const directory of [
      'home',
      'system',
      'shims',
      'homebrew/bin',
      'homebrew/sbin',
      'bun/bin',
      'nvm',
      'cargo/bin',
      'android/emulator',
      'android/platform-tools',
      'android/cmdline-tools/latest/bin',
    ]) {
      makeDirectory(fixture, directory);
    }

    const result = runEntrypoint(fixture);
    const lines = outputOf(result).trim().split('\n');

    expect(result.exitCode).toBe(0);
    expect(lines).toEqual([
      `PATH=${[
        join(fixture, 'shims'),
        join(fixture, 'homebrew/bin'),
        join(fixture, 'homebrew/sbin'),
        join(fixture, 'bun/bin'),
        join(fixture, 'cargo/bin'),
        join(fixture, 'android/emulator'),
        join(fixture, 'android/platform-tools'),
        join(fixture, 'android/cmdline-tools/latest/bin'),
        join(fixture, 'system'),
        '/usr/bin',
        '/bin',
      ].join(':')}`,
      'PRIVATE=absent',
    ]);
  });

  test('canonicalizes equivalent PATH directory variants without changing first precedence', () => {
    const fixture = createFixture();
    for (const directory of ['home', 'system', 'shims', 'homebrew/bin', 'homebrew/sbin']) {
      makeDirectory(fixture, directory);
    }

    const script = ['source "$MZSH_ENTRYPOINT"', 'print -r -- "PATH=$PATH"'].join('\n');
    const result = Bun.spawnSync([zshPath, '-fc', script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, 'home'),
        PATH: `${join(fixture, 'system')}:${join(fixture, 'system')}/:/usr/bin:/bin`,
        MZSH_ENTRYPOINT: entrypoint,
        MZSH_COMMAND_SHIM_DIR: `${join(fixture, 'shims')}/`,
        MZSH_HOMEBREW_PREFIX: `${join(fixture, 'homebrew')}/.`,
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
    expect(outputOf(result)).toBe(
      `PATH=${join(fixture, 'shims')}:${join(fixture, 'homebrew', 'bin')}:${join(fixture, 'homebrew', 'sbin')}:${join(fixture, 'system')}:/usr/bin:/bin\n`
    );
  });

  test('does not require absent application tools or private overrides', () => {
    const fixture = createFixture();
    makeDirectory(fixture, 'home');
    makeDirectory(fixture, 'system');

    const result = runEntrypoint(fixture);

    expect(result.exitCode).toBe(0);
    expect(outputOf(result)).toBe(
      `PATH=${join(fixture, 'system')}:/usr/bin:/bin\nPRIVATE=absent\n`
    );
    expect(errorOutputOf(result)).toBe('');
  });

  test('loads an existing NVM installation without selecting a hard-coded runtime', () => {
    const fixture = createFixture();
    makeDirectory(fixture, 'home');
    makeDirectory(fixture, 'system');
    const nvmDirectory = makeDirectory(fixture, 'nvm');
    writeFileSync(
      join(nvmDirectory, 'nvm.sh'),
      'export MZSH_NVM_LOADER_RAN=1\n[[ -f .nvmrc ]] && export MZSH_NVM_PROJECT_SELECTION=available\n'
    );
    writeFileSync(join(fixture, '.nvmrc'), 'lts/*\n');

    const script = [
      'function compinit() { return 0 }',
      'source "$MZSH_ENTRYPOINT"',
      'print -r -- "NVM_POLICY=${MZSH_NVM_POLICY:-absent}"',
      'print -r -- "NVM_LOADER=${MZSH_NVM_LOADER_RAN:-absent}"',
      'print -r -- "NVM_PROJECT_SELECTION=${MZSH_NVM_PROJECT_SELECTION:-absent}"',
    ].join('\n');
    const result = Bun.spawnSync([zshPath, '-fc', script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, 'home'),
        PATH: `${join(fixture, 'system')}:/usr/bin:/bin`,
        FPATH: '',
        MZSH_ENTRYPOINT: entrypoint,
        NVM_DIR: nvmDirectory,
        BUN_INSTALL: '',
        CARGO_HOME: join(fixture, 'missing-cargo'),
        ANDROID_HOME: '',
        ANDROID_SDK_ROOT: '',
        MZSH_OH_MY_ZSH_ROOT: '',
        MZSH_DOCKER_COMPLETION_DIR: '',
        MZSH_PRIVATE_ZSH: join(fixture, 'missing-private.zsh'),
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(0);
    expect(outputOf(result)).toContain('NVM_POLICY=existing-installation-only\n');
    expect(outputOf(result)).toContain('NVM_LOADER=1\n');
    expect(outputOf(result)).toContain('NVM_PROJECT_SELECTION=available\n');
  });

  test('uses the MZSH completion fallback exactly once when Oh My Zsh is absent', () => {
    const fixture = createFixture();
    makeDirectory(fixture, 'home');
    makeDirectory(fixture, 'system');

    const script = [
      'typeset -g compinit_calls=0',
      'function compinit() { (( compinit_calls++ )); return 0 }',
      'source "$MZSH_ENTRYPOINT"; source_status=$?',
      'print -r -- "SOURCE_STATUS=$source_status"',
      'print -r -- "COMPLETION_OWNER=${MZSH_COMPLETION_OWNER:-absent}"',
      'print -r -- "COMPINIT_CALLS=$compinit_calls"',
    ].join('\n');
    const result = Bun.spawnSync([zshPath, '-fc', script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, 'home'),
        PATH: `${join(fixture, 'system')}:/usr/bin:/bin`,
        XDG_CACHE_HOME: join(fixture, 'cache'),
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
    expect(errorOutputOf(result)).toBe('');
    expect(outputOf(result)).toContain('SOURCE_STATUS=0\n');
    expect(outputOf(result)).toContain('COMPLETION_OWNER=mzsh\n');
    expect(outputOf(result)).toContain('COMPINIT_CALLS=1\n');
  });

  test('registers completion directories before the framework owns one initialization', () => {
    const fixture = createFixture();
    makeDirectory(fixture, 'home');
    makeDirectory(fixture, 'system');
    const homebrewPrefix = makeDirectory(fixture, 'homebrew');
    makeDirectory(fixture, 'homebrew/share/zsh/site-functions');
    const dockerCompletionDirectory = makeDirectory(fixture, 'docker-completions');
    const frameworkRoot = makeDirectory(fixture, 'oh-my-zsh');
    writeFileSync(
      join(frameworkRoot, 'oh-my-zsh.sh'),
      [
        'typeset -g MZSH_FRAMEWORK_COMPINIT_CALLS=0',
        'function compinit() {',
        '  (( MZSH_FRAMEWORK_COMPINIT_CALLS++ ))',
        '  typeset -g MZSH_FRAMEWORK_FPATH_AT_COMPINIT="${(j:,:)fpath}"',
        '  return 0',
        '}',
        'compinit',
      ].join('\n')
    );

    const script = [
      'source "$MZSH_ENTRYPOINT" || exit 1',
      'print -r -- "COMPLETION_OWNER=$MZSH_COMPLETION_OWNER"',
      'print -r -- "FRAMEWORK_COMPINIT_CALLS=$MZSH_FRAMEWORK_COMPINIT_CALLS"',
      'print -r -- "FRAMEWORK_FPATH_AT_COMPINIT=$MZSH_FRAMEWORK_FPATH_AT_COMPINIT"',
    ].join('\n');
    const result = Bun.spawnSync([zshPath, '-fic', script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, 'home'),
        PATH: `${join(fixture, 'system')}:/usr/bin:/bin`,
        FPATH: '',
        MZSH_ENTRYPOINT: entrypoint,
        MZSH_HOMEBREW_PREFIX: homebrewPrefix,
        MZSH_DOCKER_COMPLETION_DIR: dockerCompletionDirectory,
        MZSH_OH_MY_ZSH_ROOT: frameworkRoot,
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
    expect(outputOf(result)).toContain('COMPLETION_OWNER=oh-my-zsh\n');
    expect(outputOf(result)).toContain('FRAMEWORK_COMPINIT_CALLS=1\n');
    expect(outputOf(result)).toMatch(
      new RegExp(
        `FRAMEWORK_FPATH_AT_COMPINIT=.*${join(homebrewPrefix, 'share', 'zsh', 'site-functions')}`
      )
    );
    expect(outputOf(result)).toMatch(
      new RegExp(`FRAMEWORK_FPATH_AT_COMPINIT=.*${dockerCompletionDirectory}`)
    );
  });
});
