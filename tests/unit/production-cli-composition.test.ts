import { afterEach, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runMzshCli } from '../../src/cli/run-cli';
import { createManagedCliDependencies } from '../../src/index';

const fixtures: string[] = [];

function fixture(): { home: string; xdgConfig: string; xdgCache: string; privateFile: string } {
  const root = mkdtempSync(join(import.meta.dir, '.fixtures', 'production-cli-'));
  fixtures.push(root);
  const home = join(root, 'home');
  const xdgConfig = join(home, '.config');
  const xdgCache = join(home, '.cache');
  const managedRoot = join(xdgConfig, 'mzsh');
  const privateFile = join(managedRoot, 'private.zsh');
  mkdirSync(managedRoot, { recursive: true, mode: 0o700 });
  chmodSync(managedRoot, 0o700);
  writeFileSync(privateFile, 'export SERVICE_TOKEN=\n', { mode: 0o600 });
  chmodSync(privateFile, 0o600);
  return { home, xdgConfig, xdgCache, privateFile };
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('composes names-only environment and owner-only auth services for managed CLI routes', () => {
  const paths = fixture();
  const output: string[] = [];
  const opened: string[] = [];
  const dependencies = createManagedCliDependencies({
    ...paths,
    repositoryRoot: '/checkout',
    write: (message) => output.push(message),
    owner: () => 'test-owner',
    authorization: { authorize: () => true },
    openPrivateBoundary: (path) => opened.push(path),
  });

  expect(runMzshCli(['env', 'list', '--json'], dependencies)).toBe(0);
  expect(output[0]).toBe('[{"name":"SERVICE_TOKEN","value":"[REDACTED]"}]');
  output.splice(0);
  expect(runMzshCli(['env', 'set', 'SERVICE_TOKEN'], dependencies)).toBe(0);
  expect(opened).toEqual([paths.privateFile]);
  expect(output[0]).toBe('SERVICE_TOKEN [REDACTED]');
});

test('fails closed when the production private boundary is unavailable', () => {
  const paths = fixture();
  rmSync(paths.privateFile);
  const output: string[] = [];
  const dependencies = createManagedCliDependencies({
    ...paths,
    repositoryRoot: '/checkout',
    write: (message) => output.push(message),
  });

  expect(runMzshCli(['env', 'list'], dependencies)).toBe(1);
  expect(output).toEqual(['MZSH_ENVIRONMENT_PRIVATE_BOUNDARY_REQUIRED']);
});
