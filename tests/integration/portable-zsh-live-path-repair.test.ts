import { afterEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import * as helpers from './portable-zsh-test-helpers';

const {
  createFixture,
  chmodSync,
  cleanupFixtures,
  entrypoint,
  makeDirectory,
  outputOf,
  portableEnvironment,
  symlinkSync,
  zshPath,
} = helpers;

afterEach(cleanupFixtures);

test('keeps managed shims first when the portable manifest finishes', () => {
  const fixture = createFixture();
  for (const directory of ['home', 'system', 'shims']) {
    makeDirectory(fixture, directory);
  }

  const result = Bun.spawnSync(
    [
      zshPath,
      '-fc',
      ['source "$MZSH_ENTRYPOINT" || exit 1', 'print -r -- "PATH=$PATH"'].join('\n'),
    ],
    {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, 'home'),
        PATH: `${join(fixture, 'system')}:/usr/bin:/bin`,
        MZSH_ENTRYPOINT: entrypoint,
        MZSH_COMMAND_SHIM_DIR: join(fixture, 'shims'),
        BUN_INSTALL: '',
        NVM_DIR: '',
        CARGO_HOME: '',
        ANDROID_HOME: '',
        ANDROID_SDK_ROOT: '',
        MZSH_HOMEBREW_PREFIX: '',
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
});

test('loads generic runtime entries from the secure data-only host boundary', () => {
  const fixture = createFixture();
  const runtimeRoot = join(fixture, 'runtime-paths');
  const runtimeTargets = join(fixture, 'runtime-targets');
  for (const directory of [
    'home',
    'system',
    'shims',
    'runtime-paths',
    'runtime-targets/python',
    'runtime-targets/ruby',
    'runtime-targets/go',
    'runtime-targets/postgresql',
    'runtime-targets/java',
    'runtime-targets/pnpm',
  ]) {
    makeDirectory(fixture, directory);
  }
  for (const entry of ['python', 'ruby', 'go', 'postgresql', 'java', 'pnpm']) {
    symlinkSync(join(runtimeTargets, entry), join(runtimeRoot, entry));
  }
  chmodSync(runtimeRoot, 0o700);

  const result = Bun.spawnSync(
    [zshPath, '-fc', 'source "$MZSH_ENTRYPOINT" || exit 1; print -r -- "PATH=$PATH"'],
    {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, 'home'),
        PATH: `${join(fixture, 'system')}:/usr/bin:/bin`,
        MZSH_ENTRYPOINT: entrypoint,
        MZSH_COMMAND_SHIM_DIR: join(fixture, 'shims'),
        MZSH_HOMEBREW_PREFIX: '',
        HOMEBREW_PREFIX: '',
        MZSH_RUNTIME_PATHS_DIRECTORY: runtimeRoot,
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
    `PATH=${[
      join(fixture, 'shims'),
      join(runtimeRoot, 'python'),
      join(runtimeRoot, 'ruby'),
      join(runtimeRoot, 'go'),
      join(runtimeRoot, 'postgresql'),
      join(runtimeRoot, 'java'),
      join(runtimeRoot, 'pnpm'),
      join(fixture, 'system'),
      '/usr/bin',
      '/bin',
    ].join(':')}\n`
  );
});
