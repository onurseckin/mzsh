import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { planLocalInstallationUpdate } from '../../src/application/update-local-installation';
import { LocalRepository } from '../../src/infrastructure/local-repository';

const fixtureParent = join(import.meta.dir, '.fixtures');
const fixtures: string[] = [];

function createFixture(): string {
  mkdirSync(fixtureParent, { recursive: true });
  const fixture = mkdtempSync(join(fixtureParent, 'repository-audit-'));
  fixtures.push(fixture);
  return fixture;
}

function createRepository(root: string): void {
  mkdirSync(join(root, 'portable', 'zsh'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'mzsh', version: '1.0.0' }));
  writeFileSync(join(root, 'portable', 'zsh', 'init.zsh'), 'return 0\n');
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

describe('local MZSH repository inspection and update planning', () => {
  test('recognizes only an explicit absolute checkout with mzsh metadata and a readable entrypoint', () => {
    const root = createFixture();
    createRepository(root);

    const state = new LocalRepository().inspect(root);

    expect(state).toEqual({
      kind: 'present',
      root,
      packageName: 'mzsh',
      portableEntrypoint: join(root, 'portable', 'zsh', 'init.zsh'),
    });
  });

  test('classifies absent roots and invalid metadata or entrypoints without exposing filesystem errors', () => {
    const missingRoot = join(createFixture(), 'missing');
    const invalidMetadataRoot = createFixture();
    const missingEntrypointRoot = createFixture();
    writeFileSync(join(invalidMetadataRoot, 'package.json'), 'not json');
    writeFileSync(join(missingEntrypointRoot, 'package.json'), JSON.stringify({ name: 'mzsh' }));

    const repository = new LocalRepository();
    expect(repository.inspect(missingRoot)).toEqual({
      kind: 'missing',
      root: missingRoot,
      reason: 'root-absent',
    });
    expect(repository.inspect(invalidMetadataRoot)).toEqual({
      kind: 'invalid',
      root: invalidMetadataRoot,
      code: 'package-metadata-invalid',
      message: 'MZSH package metadata is unreadable or invalid.',
    });
    expect(repository.inspect(missingEntrypointRoot)).toEqual({
      kind: 'invalid',
      root: missingEntrypointRoot,
      code: 'portable-entrypoint-missing',
      message: 'The portable Zsh entrypoint is missing or unreadable.',
    });
    expect(repository.inspect('relative-repository')).toEqual({
      kind: 'invalid',
      root: 'relative-repository',
      code: 'repository-root-not-absolute',
      message: 'Repository inspection requires an absolute root path.',
    });
  });

  test('returns a guarded local-only update result for missing and invalid repositories', () => {
    const presentRoot = createFixture();
    createRepository(presentRoot);
    const missingRoot = join(createFixture(), 'missing');
    const invalidRoot = createFixture();
    writeFileSync(join(invalidRoot, 'package.json'), JSON.stringify({ name: 'other-tool' }));
    const repository = new LocalRepository();

    expect(planLocalInstallationUpdate(repository.inspect(presentRoot))).toEqual({
      kind: 'ready',
      root: presentRoot,
      portableEntrypoint: join(presentRoot, 'portable', 'zsh', 'init.zsh'),
      action: 'local-update-ready',
    });
    expect(planLocalInstallationUpdate(repository.inspect(missingRoot))).toEqual({
      kind: 'prerequisite-required',
      root: missingRoot,
      reason: 'repository-missing',
      message: 'A local MZSH checkout is required before an update can be planned.',
    });
    expect(planLocalInstallationUpdate(repository.inspect(invalidRoot))).toEqual({
      kind: 'prerequisite-required',
      root: invalidRoot,
      reason: 'repository-invalid',
      message: 'The local MZSH checkout must be repaired before an update can be planned.',
    });
  });
});
