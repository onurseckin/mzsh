import { afterEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import * as helpers from './portable-zsh-test-helpers';

const {
  chmodSync,
  cleanupFixtures,
  copyPortableRoot,
  createFixture,
  errorOutputOf,
  injectBoundaryFailure,
  makeDirectory,
  outputOf,
  portableEnvironment,
  symlinkSync,
  writeFileSync,
  zshPath,
} = helpers;

afterEach(cleanupFixtures);

function securedRuntimeDirectory(fixture: string): { root: string; targets: string } {
  const root = makeDirectory(fixture, 'runtime-paths');
  const targets = makeDirectory(fixture, 'runtime-targets');
  makeDirectory(fixture, 'runtime-targets/python');
  symlinkSync(join(targets, 'python'), join(root, 'python'));
  chmodSync(root, 0o700);
  return { root, targets };
}

test('cleans runtime directory state after login failure and permits a retry', () => {
  const fixture = createFixture();
  const portableRoot = copyPortableRoot(fixture);
  const failureVariable = injectBoundaryFailure(portableRoot, 'runtime-paths');
  for (const directory of ['home', 'system', 'shims']) makeDirectory(fixture, directory);
  const runtime = securedRuntimeDirectory(fixture);

  const result = Bun.spawnSync(
    [
      zshPath,
      '-fc',
      [
        `${failureVariable}=1`,
        'source "$MZSH_LOGIN_MANIFEST"; first_status=$?',
        'print -r -- "FIRST=$first_status"',
        'print -r -- "RUNTIMES_AFTER_FAILURE=${+parameters[MZSH_PATH_RUNTIMES]}"',
        'print -r -- "RUNTIME_HELPER_AFTER_FAILURE=${+functions[mzsh_path_add_runtime]}"',
        'print -r -- "EFFECTIVE_PREFIX_AFTER_FAILURE=${+parameters[MZSH_HOMEBREW_EFFECTIVE_PREFIX]}"',
        'print -r -- "DIRECTORY_HELPER_AFTER_FAILURE=${+functions[mzsh_runtime_directory_mode]}"',
        'print -r -- "CONFIG_VALUE_AFTER_FAILURE=${+parameters[MZSH_PYTHON_PREFIX]}"',
        `unset ${failureVariable}`,
        'source "$MZSH_LOGIN_MANIFEST"; second_status=$?',
        'print -r -- "SECOND=$second_status"',
        'print -r -- "PATH=$PATH"',
      ].join('\n'),
    ],
    {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, 'home'),
        PATH: `${join(fixture, 'system')}:/usr/bin:/bin`,
        MZSH_LOGIN_MANIFEST: join(portableRoot, 'login-manifest.zsh'),
        MZSH_COMMAND_SHIM_DIR: join(fixture, 'shims'),
        MZSH_RUNTIME_PATHS_DIRECTORY: runtime.root,
        MZSH_HOMEBREW_PREFIX: '',
        HOMEBREW_PREFIX: '',
        BUN_INSTALL: '',
        NVM_DIR: '',
        CARGO_HOME: '',
        ANDROID_HOME: '',
        ANDROID_SDK_ROOT: '',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    }
  );

  expect(result.exitCode).toBe(0);
  expect(outputOf(result)).toBe(
    [
      'FIRST=1',
      'RUNTIMES_AFTER_FAILURE=0',
      'RUNTIME_HELPER_AFTER_FAILURE=0',
      'EFFECTIVE_PREFIX_AFTER_FAILURE=0',
      'DIRECTORY_HELPER_AFTER_FAILURE=0',
      'CONFIG_VALUE_AFTER_FAILURE=0',
      'SECOND=0',
      `PATH=${join(fixture, 'shims')}:${join(runtime.root, 'python')}:${join(fixture, 'system')}:/usr/bin:/bin`,
      '',
    ].join('\n')
  );
});

test('rejects a symlinked runtime root without disclosing its path', () => {
  const fixture = createFixture();
  for (const directory of ['home', 'system', 'shims', 'runtime-target']) {
    makeDirectory(fixture, directory);
  }
  const runtimeRoot = join(fixture, 'runtime-paths');
  symlinkSync(join(fixture, 'runtime-target'), runtimeRoot);

  const result = Bun.spawnSync(
    [zshPath, '-fc', 'source "$MZSH_ENTRYPOINT" || exit 1; print -r -- "PATH=$PATH"'],
    {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, 'home'),
        PATH: `${join(fixture, 'system')}:/usr/bin:/bin`,
        MZSH_ENTRYPOINT: helpers.entrypoint,
        MZSH_COMMAND_SHIM_DIR: join(fixture, 'shims'),
        MZSH_RUNTIME_PATHS_DIRECTORY: runtimeRoot,
        MZSH_OBSERVE: '1',
        MZSH_HOMEBREW_PREFIX: '',
        HOMEBREW_PREFIX: '',
        BUN_INSTALL: '',
        NVM_DIR: '',
        CARGO_HOME: '',
        ANDROID_HOME: '',
        ANDROID_SDK_ROOT: '',
        MZSH_PRIVATE_ZSH: join(fixture, 'missing-private.zsh'),
      },
      stdout: 'pipe',
      stderr: 'pipe',
    }
  );

  expect(result.exitCode).toBe(0);
  expect(outputOf(result)).toBe(
    `PATH=${join(fixture, 'shims')}:${join(fixture, 'system')}:/usr/bin:/bin\n`
  );
  expect(errorOutputOf(result)).toContain('mzsh: skipped insecure runtime paths directory\n');
  expect(errorOutputOf(result)).not.toContain(runtimeRoot);
});

test('does not read hostile regular entries or broken symlink targets', () => {
  const fixture = createFixture();
  for (const directory of ['home', 'system', 'shims', 'runtime-paths']) {
    makeDirectory(fixture, directory);
  }
  const runtimeRoot = join(fixture, 'runtime-paths');
  const sentinel = join(fixture, 'sentinel');
  writeFileSync(join(runtimeRoot, 'python'), `touch ${sentinel}\n`);
  symlinkSync(join(fixture, 'missing-target'), join(runtimeRoot, 'ruby'));
  chmodSync(runtimeRoot, 0o700);

  const result = Bun.spawnSync(
    [
      zshPath,
      '-fc',
      [
        'source "$MZSH_ENTRYPOINT" || exit 1',
        'print -r -- "PATH=$PATH"',
        'print -r -- "SENTINEL=$([[ -e $MZSH_TEST_SENTINEL ]] && print present || print absent)"',
        'print -r -- "PREFIX_VARIABLE=${+parameters[MZSH_PYTHON_PREFIX]}"',
      ].join('\n'),
    ],
    {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, 'home'),
        PATH: `${join(fixture, 'system')}:/usr/bin:/bin`,
        MZSH_ENTRYPOINT: helpers.entrypoint,
        MZSH_COMMAND_SHIM_DIR: join(fixture, 'shims'),
        MZSH_RUNTIME_PATHS_DIRECTORY: runtimeRoot,
        MZSH_TEST_SENTINEL: sentinel,
        MZSH_HOMEBREW_PREFIX: '',
        HOMEBREW_PREFIX: '',
        BUN_INSTALL: '',
        NVM_DIR: '',
        CARGO_HOME: '',
        ANDROID_HOME: '',
        ANDROID_SDK_ROOT: '',
        MZSH_PRIVATE_ZSH: join(fixture, 'missing-private.zsh'),
      },
      stdout: 'pipe',
      stderr: 'pipe',
    }
  );

  expect(result.exitCode).toBe(0);
  expect(outputOf(result)).toBe(
    `PATH=${join(fixture, 'shims')}:${join(fixture, 'system')}:/usr/bin:/bin\nSENTINEL=absent\nPREFIX_VARIABLE=0\n`
  );
  expect(errorOutputOf(result)).toBe('');
});
