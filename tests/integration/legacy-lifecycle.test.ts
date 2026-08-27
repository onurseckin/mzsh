import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dir, '../..');
const fixtures: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(repositoryRoot, 'tests', '.fixtures', 'legacy-lifecycle-'));
  mkdirSync(join(root, 'home'));
  fixtures.push(root);
  return root;
}

function text(value: Uint8Array | null): string {
  return value === null ? '' : new TextDecoder().decode(value);
}

afterEach(() =>
  fixtures.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
);

test('retires the installer before it can mutate an isolated home', () => {
  const root = fixture();
  const result = Bun.spawnSync(['bash', join(repositoryRoot, 'install.sh')], {
    cwd: root,
    env: { HOME: join(root, 'home'), PATH: '/usr/bin:/bin' },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  expect(result.exitCode).toBe(2);
  expect(text(result.stdout)).toContain('Run: mzsh setup');
  expect(text(result.stderr)).toBe('');
});

test('retires the uninstaller in favor of receipt-backed rollback', () => {
  const root = fixture();
  const result = Bun.spawnSync(['bash', join(repositoryRoot, 'uninstall.sh')], {
    cwd: root,
    env: { HOME: join(root, 'home'), PATH: '/usr/bin:/bin' },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  expect(result.exitCode).toBe(2);
  expect(text(result.stdout)).toContain('Then: bun run mzsh -- rollback receipt-id');
  expect(text(result.stderr)).toBe('');
});

test('retires the package update script without chaining global lifecycle commands', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'update'], {
    cwd: repositoryRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  expect(result.exitCode).toBe(2);
  expect(text(result.stdout)).toContain(
    'bun run mzsh -- update --source /absolute/mzsh-checkout --apply --plan-id reviewed-plan-id --confirm APPLY'
  );
});

test('keeps every shell compatibility notice checkout-local', () => {
  const result = Bun.spawnSync(
    [
      'bash',
      '-c',
      'source "$1"; managed_lifecycle_notice installation; managed_lifecycle_notice update; managed_lifecycle_notice uninstallation',
      'bash',
      join(repositoryRoot, 'src', 'messages', 'shellMessages.sh'),
    ],
    { stdout: 'pipe', stderr: 'pipe' }
  );

  expect(result.exitCode).toBe(0);
  expect(text(result.stdout).trim().split('\n')).toEqual([
    'MZSH legacy installation is retired.',
    'Run: bun run mzsh -- audit',
    'Then: bun run mzsh -- bootstrap --source /absolute/mzsh-checkout',
    'Capture reviewedPlanId from dry output, then use --apply --plan-id reviewed-plan-id --confirm APPLY.',
    'MZSH legacy update is retired.',
    'Run: bun run mzsh -- audit',
    'Then: bun run mzsh -- update --source /absolute/mzsh-checkout',
    'Capture reviewedPlanId from dry output, then use --apply --plan-id reviewed-plan-id --confirm APPLY.',
    'MZSH legacy uninstallation is retired.',
    'Run: bun run mzsh -- audit',
    'Then: bun run mzsh -- rollback receipt-id',
    'Capture reviewedPlanId from dry output, then use --apply --plan-id reviewed-plan-id --confirm APPLY.',
  ]);
  expect(text(result.stderr)).toBe('');
});
