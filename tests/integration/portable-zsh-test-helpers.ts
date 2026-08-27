import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

export {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  join,
};

export const repositoryRoot = resolve(import.meta.dir, '../..');
export const entrypoint = join(repositoryRoot, 'portable', 'zsh', 'init.zsh');
const fixtureParent = join(repositoryRoot, 'tests', '.fixtures');
const fixtures: string[] = [];
const discoveredZshPath = Bun.which('zsh');

if (discoveredZshPath === null) {
  throw new Error('portable Zsh tests require zsh');
}

export const zshPath = discoveredZshPath;

export function portableEnvironment(): Record<string, string | undefined> {
  return {
    ...process.env,
    HOMEBREW_PREFIX: '',
    PNPM_HOME: '',
    MZSH_PNPM_GLOBAL_BIN: '',
    RUBY_HOME: '',
    PYTHONUSERBASE: '',
    GOPATH: '',
    JAVA_HOME: '',
  };
}

export function createFixture(): string {
  mkdirSync(fixtureParent, { recursive: true });
  const fixture = mkdtempSync(join(fixtureParent, 'portable-zsh-'));
  fixtures.push(fixture);
  return fixture;
}

export function makeDirectory(root: string, relativePath: string): string {
  const directory = join(root, relativePath);
  mkdirSync(directory, { recursive: true });
  return directory;
}

export function copyPortableRoot(fixture: string): string {
  const portableRoot = join(fixture, 'portable-zsh');
  cpSync(join(repositoryRoot, 'portable', 'zsh'), portableRoot, { recursive: true });
  return portableRoot;
}

export function injectBoundaryFailure(
  portableRoot: string,
  boundary: 'path' | 'runtime-paths' | 'oh-my-zsh' | 'completion' | 'private'
): string {
  const modulePath = join(portableRoot, 'modules', `${boundary}.zsh`);
  const module = readFileSync(modulePath, 'utf8');
  const finalReturn = '\nreturn 0\n';
  const finalReturnIndex = module.lastIndexOf(finalReturn);

  if (finalReturnIndex < 0) {
    throw new Error(`expected ${boundary} module to end with return 0`);
  }

  const failureVariable = `MZSH_TEST_FAIL_AFTER_${boundary.replaceAll('-', '_').toUpperCase()}`;
  const failureHook = [
    `if [[ $${failureVariable} == 1 ]]; then`,
    `  typeset -g MZSH_TEST_BOUNDARY_EXECUTED=${boundary}`,
    '  return 1',
    'fi',
  ].join('\n');
  writeFileSync(
    modulePath,
    `${module.slice(0, finalReturnIndex)}\n${failureHook}${module.slice(finalReturnIndex)}`
  );

  return failureVariable;
}

export function runEntrypoint(
  fixture: string,
  privateFile?: string
): ReturnType<typeof Bun.spawnSync> {
  const script = [
    'source "$MZSH_ENTRYPOINT" || exit 1',
    'print -r -- "PATH=$PATH"',
    'print -r -- "PRIVATE=${MZSH_PRIVATE_VALUE:-absent}"',
  ].join('\n');

  return Bun.spawnSync([zshPath, '-fc', script], {
    cwd: fixture,
    env: {
      ...portableEnvironment(),
      HOME: join(fixture, 'home'),
      PATH: [join(fixture, 'system'), join(fixture, 'system'), '/usr/bin', '/bin'].join(':'),
      XDG_CACHE_HOME: join(fixture, 'cache'),
      MZSH_ENTRYPOINT: entrypoint,
      MZSH_COMMAND_SHIM_DIR: join(fixture, 'shims'),
      MZSH_HOMEBREW_PREFIX: join(fixture, 'homebrew'),
      BUN_INSTALL: join(fixture, 'bun'),
      NVM_DIR: join(fixture, 'nvm'),
      CARGO_HOME: join(fixture, 'cargo'),
      ANDROID_HOME: join(fixture, 'android'),
      PNPM_HOME: '',
      MZSH_PNPM_GLOBAL_BIN: '',
      RUBY_HOME: '',
      PYTHONUSERBASE: '',
      GOPATH: '',
      JAVA_HOME: '',
      MZSH_OH_MY_ZSH_ROOT: '',
      MZSH_DOCKER_COMPLETION_DIR: '',
      MZSH_PRIVATE_ZSH:
        privateFile === undefined ? join(fixture, 'missing-private.zsh') : privateFile,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

export function outputOf(result: ReturnType<typeof Bun.spawnSync>): string {
  if (!(result.stdout instanceof Uint8Array)) {
    throw new Error('expected piped standard output');
  }

  return new TextDecoder().decode(result.stdout);
}

export function errorOutputOf(result: ReturnType<typeof Bun.spawnSync>): string {
  if (!(result.stderr instanceof Uint8Array)) {
    throw new Error('expected piped standard error');
  }

  return new TextDecoder().decode(result.stderr);
}

export function cleanupFixtures(): void {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { recursive: true, force: true });
  }
}
