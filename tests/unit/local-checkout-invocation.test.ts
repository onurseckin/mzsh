import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const fixtures: string[] = [];

function fixture(): string {
  const fixtureParent = join(import.meta.dir, '.fixtures');
  mkdirSync(fixtureParent, { recursive: true });
  const root = mkdtempSync(join(fixtureParent, 'local-mzsh-'));
  fixtures.push(root);
  mkdirSync(join(root, 'home', '.config'), { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('runs audit from a checkout through the supported package script', () => {
  const root = fixture();
  expect(readFileSync(join(import.meta.dir, '../..', 'package.json'), 'utf8')).toContain(
    '"mzsh": "bun run bin/run-standalone.ts"'
  );
  const result = spawnSync(process.execPath, ['run', 'mzsh', '--', 'audit', '--json'], {
    cwd: join(import.meta.dir, '../..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: join(root, 'home'),
      XDG_CONFIG_HOME: join(root, 'home', '.config'),
      XDG_CACHE_HOME: join(root, 'home', '.cache'),
    },
  });

  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(
    expect.objectContaining({
      version: 1,
      findings: expect.any(Array),
      roots: expect.objectContaining({ home: join(root, 'home') }),
    })
  );
});
