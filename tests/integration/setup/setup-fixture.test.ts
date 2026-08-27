import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { shellSetupRecoveryOutcome, ShellSetup } from '../../../src/infrastructure/shell-setup';
import { NodeAdoptionFilesystem } from '../../../src/infrastructure/adoption-filesystem';

const fixtures: string[] = [];

function fixture(): string {
  const parent = join(import.meta.dir, '.fixtures');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'setup-'));
  fixtures.push(root);
  mkdirSync(join(root, 'home'), { mode: 0o700 });
  mkdirSync(join(root, 'repository', 'portable', 'zsh'), { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

function failureOf(callback: () => void): Error {
  try {
    callback();
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error('EXPECTED_FAILURE');
}

class ThrowAfterWriteFilesystem extends NodeAdoptionFilesystem {
  private hasFailed = false;

  constructor(private readonly failingPath: string) {
    super();
  }

  override writeAtomic(path: string, content: string | Uint8Array, mode = 0o600): void {
    super.writeAtomic(path, content, mode);
    if (path === this.failingPath && !this.hasFailed) {
      this.hasFailed = true;
      throw new Error('INJECTED_WRITE_FAILURE');
    }
  }
}

class PersistentRecoveryFailureFilesystem extends NodeAdoptionFilesystem {
  private hasMutated = false;

  constructor(private readonly failingPath: string) {
    super();
  }

  override writeAtomic(path: string, content: string | Uint8Array, mode = 0o600): void {
    super.writeAtomic(path, content, mode);
    if (path !== this.failingPath) return;
    if (this.hasMutated) throw new Error('INJECTED_RECOVERY_FAILURE');
    this.hasMutated = true;
    throw new Error('INJECTED_MUTATION_FAILURE');
  }
}

class PersistentRemoveFailureFilesystem extends NodeAdoptionFilesystem {
  private hasMutated = false;

  constructor(private readonly failingPath: string) {
    super();
  }

  override writeAtomic(path: string, content: string | Uint8Array, mode = 0o600): void {
    super.writeAtomic(path, content, mode);
    if (path !== this.failingPath || this.hasMutated) return;
    this.hasMutated = true;
    throw new Error('INJECTED_MUTATION_FAILURE');
  }

  override remove(path: string): void {
    super.remove(path);
    if (path === this.failingPath) throw new Error('INJECTED_RECOVERY_FAILURE');
  }
}

test('reconciles stable shell loaders idempotently within an isolated home fixture', () => {
  const root = fixture();
  const home = join(root, 'home');
  const repository = join(root, 'repository');
  const shell = new ShellSetup(home);

  expect(shell.reconcile(repository)).toBe('shell-reconciled');
  const loader = readFileSync(join(home, '.zshrc'), 'utf8');
  expect(loader).toContain('# mzsh-managed-loader');
  expect(shell.reconcile(repository)).toBe('shell-already-reconciled');
  expect(readFileSync(join(home, '.zshrc'), 'utf8')).toBe(loader);
});

test('preflights every loader before writing any managed loader', () => {
  const root = fixture();
  const home = join(root, 'home');
  const repository = join(root, 'repository');
  writeFileSync(join(home, '.zprofile'), 'unowned loader\n', { mode: 0o600 });

  expect(() => new ShellSetup(home).reconcile(repository)).toThrow('SHELL_LOADER_UNOWNED');
  expect(existsSync(join(home, '.zshenv'))).toBe(false);
  expect(existsSync(join(home, '.zshrc'))).toBe(false);
});

test('restores every loader when an atomic write throws after replacing its target', () => {
  const root = fixture();
  const home = join(root, 'home');
  const repository = join(root, 'repository');
  const paths = ['.zshenv', '.zprofile', '.zshrc'].map((loader) => join(home, loader));
  const previous = paths.map((path) => `# mzsh-managed-loader\n${path}\n`);
  for (const [index, path] of paths.entries())
    writeFileSync(path, previous[index]!, { mode: 0o600 });

  expect(() =>
    new ShellSetup(home, new ThrowAfterWriteFilesystem(paths[1]!)).reconcile(repository)
  ).toThrow('INJECTED_WRITE_FAILURE');
  expect(paths.map((path) => readFileSync(path, 'utf8'))).toEqual(previous);
});

test('continues recovery after a persistent post-replace loader failure', () => {
  const root = fixture();
  const home = join(root, 'home');
  const repository = join(root, 'repository');
  const paths = ['.zshenv', '.zprofile', '.zshrc'].map((loader) => join(home, loader));
  const previous = paths.map((path) => `# mzsh-managed-loader\n${path}\n`);
  for (const [index, path] of paths.entries())
    writeFileSync(path, previous[index]!, { mode: 0o600 });

  const failure = failureOf(() =>
    new ShellSetup(home, new PersistentRecoveryFailureFilesystem(paths[1]!)).reconcile(repository)
  );
  expect(failure.message).toBe('INJECTED_MUTATION_FAILURE');
  expect(shellSetupRecoveryOutcome(failure)).toEqual({
    attempted: 2,
    restored: 1,
    failed: 1,
  });
  expect(readFileSync(paths[0]!, 'utf8')).toBe(previous[0]);
  expect(readFileSync(paths[1]!, 'utf8')).toBe(previous[1]);
});

test('continues recovery after a post-remove loader failure', () => {
  const root = fixture();
  const home = join(root, 'home');
  const repository = join(root, 'repository');
  const paths = ['.zshenv', '.zprofile', '.zshrc'].map((loader) => join(home, loader));
  const previous = paths.slice(0, 2).map((path) => `# mzsh-managed-loader\n${path}\n`);
  for (const [index, path] of paths.slice(0, 2).entries())
    writeFileSync(path, previous[index]!, { mode: 0o600 });

  const failure = failureOf(() =>
    new ShellSetup(home, new PersistentRemoveFailureFilesystem(paths[2]!)).reconcile(repository)
  );
  expect(failure.message).toBe('INJECTED_MUTATION_FAILURE');
  expect(shellSetupRecoveryOutcome(failure)).toEqual({
    attempted: 3,
    restored: 2,
    failed: 1,
  });
  expect(paths.slice(0, 2).map((path) => readFileSync(path, 'utf8'))).toEqual(previous);
  expect(existsSync(paths[2]!)).toBe(false);
});
