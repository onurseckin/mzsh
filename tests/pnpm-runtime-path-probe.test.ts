import { afterEach, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inspectPnpmRuntimeDirectory } from '../src/infrastructure/pnpm-runtime-path-probe';

const fixtureParent = join(import.meta.dir, '.fixtures');
const fixtures: string[] = [];

function createFixture(): string {
  mkdirSync(fixtureParent, { recursive: true });
  const fixture = mkdtempSync(join(fixtureParent, 'pnpm-runtime-path-'));
  fixtures.push(fixture);
  return fixture;
}

function currentUserId(): number {
  const userId = process.getuid?.();
  if (userId === undefined)
    throw new Error('Current user id is required for this filesystem test.');
  return userId;
}

function runtimeRoot(fixture: string): string {
  return join(fixture, 'config', 'mzsh', 'runtime-paths');
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

test('returns the stable managed pnpm entry for a safe data-only runtime root', () => {
  const fixture = createFixture();
  const root = runtimeRoot(fixture);
  const target = join(fixture, 'pnpm-global-bin');
  mkdirSync(root, { recursive: true });
  mkdirSync(target);
  chmodSync(root, 0o700);
  symlinkSync(target, join(root, 'pnpm'));

  expect(inspectPnpmRuntimeDirectory(join(fixture, 'config'), currentUserId())).toEqual({
    status: 'present',
    directory: join(root, 'pnpm'),
  });
});

test('fails closed for an insecure root and invalid pnpm entries', () => {
  const fixture = createFixture();
  const root = runtimeRoot(fixture);
  expect(inspectPnpmRuntimeDirectory(join(fixture, 'config'), currentUserId())).toEqual({
    status: 'absent',
  });

  mkdirSync(root, { recursive: true });
  chmodSync(root, 0o755);
  expect(inspectPnpmRuntimeDirectory(join(fixture, 'config'), currentUserId())).toEqual({
    status: 'failed',
  });

  chmodSync(root, 0o700);
  writeFileSync(join(root, 'pnpm'), 'not executable configuration\n');
  expect(inspectPnpmRuntimeDirectory(join(fixture, 'config'), currentUserId())).toEqual({
    status: 'failed',
  });
});
