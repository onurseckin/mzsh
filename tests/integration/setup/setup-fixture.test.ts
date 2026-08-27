import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ShellSetup } from '../../../src/infrastructure/shell-setup';

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
