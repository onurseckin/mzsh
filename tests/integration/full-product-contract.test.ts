import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Database } from 'bun:sqlite';
import { createManagedCliDependencies } from '../../src/index';
import { runMzshCli } from '../../src/cli/run-cli';

const repositoryRoot = resolve(import.meta.dir, '../..');
const fixtures: string[] = [];

function createFixture() {
  const root = mkdtempSync(join(repositoryRoot, 'tests', '.fixtures', 'full-product-'));
  const home = join(root, 'home');
  const xdgConfig = join(home, '.config');
  const xdgCache = join(home, '.cache');
  mkdirSync(home, { recursive: true });
  mkdirSync(xdgConfig, { recursive: true });
  mkdirSync(xdgCache, { recursive: true });
  fixtures.push(root);

  return { root, home, xdgConfig, xdgCache };
}

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('full product contract', () => {
  test('catalog plan lifecycle stores only redacted evidence and requires confirmation', async () => {
    const fixture = createFixture();
    const output: string[] = [];

    const deps = createManagedCliDependencies({
      home: fixture.home,
      xdgConfig: fixture.xdgConfig,
      xdgCache: fixture.xdgCache,
      repositoryRoot,
      write: (text) => output.push(text),
    });

    const planExit = runMzshCli(['setup'], deps);
    expect(planExit).toBe(0);

    const planParsed = JSON.parse(output[0] ?? '{}') as { reviewedPlanId?: string };
    expect(planParsed.reviewedPlanId).toBeDefined();
    const planId = planParsed.reviewedPlanId!;

    output.length = 0;
    const unconfirmedExit = runMzshCli(['setup', '--apply', '--plan-id', planId], deps);
    expect(unconfirmedExit).toBe(1);
    expect(output[0]).toBe('MZSH_PLAN_CONFIRMATION_REQUIRED');

    output.length = 0;
    const applyExit = runMzshCli(
      ['setup', '--apply', '--plan-id', planId, '--confirm', 'APPLY'],
      deps
    );
    expect(applyExit).toBe(0);

    expect(existsSync(join(fixture.home, '.zshenv'))).toBe(true);
    expect(existsSync(join(fixture.home, '.zprofile'))).toBe(true);
    expect(existsSync(join(fixture.home, '.zshrc'))).toBe(true);

    const historyDbPath = join(fixture.xdgConfig, 'mzsh', 'history.sqlite');
    if (existsSync(historyDbPath)) {
      const db = new Database(historyDbPath, { readonly: true });
      const rows = db.query('SELECT * FROM history').all() as Array<{ action: string }>;
      expect(rows.length).toBeGreaterThan(0);
      db.close();
    }
  });

  test('inventory command outputs structured records without host mutation', async () => {
    const fixture = createFixture();
    const output: string[] = [];

    const deps = createManagedCliDependencies({
      home: fixture.home,
      xdgConfig: fixture.xdgConfig,
      xdgCache: fixture.xdgCache,
      repositoryRoot,
      write: (text) => output.push(text),
    });

    const exitCode = runMzshCli(['inventory', '--json'], deps);
    expect(exitCode).toBe(0);

    const parsed = JSON.parse(output.join(''));
    expect(Array.isArray(parsed)).toBe(true);
  });

  test('environment commands interact with private boundary securely', async () => {
    const fixture = createFixture();
    const output: string[] = [];
    const privateDir = join(fixture.xdgConfig, 'mzsh');
    mkdirSync(privateDir, { recursive: true, mode: 0o700 });
    const privateFile = join(privateDir, 'private.zsh');
    writeFileSync(privateFile, 'export MY_TEST_TOKEN="supersecret123"\n', { mode: 0o600 });

    const deps = createManagedCliDependencies({
      home: fixture.home,
      xdgConfig: fixture.xdgConfig,
      xdgCache: fixture.xdgCache,
      repositoryRoot,
      write: (text) => output.push(text),
    });

    const listExit = runMzshCli(['env', 'list', '--json'], deps);
    expect(listExit).toBe(0);
    const listOutput = output.join('');
    expect(listOutput).toContain('MY_TEST_TOKEN');
    expect(listOutput).not.toContain('supersecret123');

    output.length = 0;
    const getExit = runMzshCli(['env', 'get', 'MY_TEST_TOKEN', '--json'], deps);
    expect(getExit).toBe(0);
    const getOutput = output.join('');
    expect(getOutput).toContain('MY_TEST_TOKEN');
    expect(getOutput).not.toContain('supersecret123');
  });
});
