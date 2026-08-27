import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArguments } from '../../src/cli/parse-arguments';
import { classifySensitiveAssignment } from '../../src/application/sensitive-assignment-policy';
import { runMzshCli } from '../../src/cli/run-cli';
import type { EnvironmentSnapshot } from '../../src/domain/audit';
import { isManagedCliRoute, managedRepositoryRoot } from '../../src/index';

const snapshot: EnvironmentSnapshot = {
  roots: {
    home: '/home',
    xdgConfig: '/home/.config',
    xdgCache: '/home/.cache',
    repository: '/checkout',
  },
  repository: { kind: 'missing', root: '/checkout', reason: 'root-absent' },
  pathEntries: [],
  zshTopology: 'modular',
  currentLink: 'absent',
  privateFile: { kind: 'absent', assignmentCount: 0 },
  nodeOwnership: { nvmInteractive: false, homebrewPrivateNode: false },
  pnpm: { status: 'absent', globalBinDiscoverable: false },
  java: { status: 'not-applicable' },
  commands: [],
  probeFailures: [],
};

function cliFixture(): {
  root: string;
  home: string;
  config: string;
  repository: string;
  legacy: string;
} {
  const fixtureParent = join(import.meta.dir, '.fixtures');
  mkdirSync(fixtureParent, { recursive: true });
  const root = mkdtempSync(join(fixtureParent, 'mzsh-cli-'));
  const home = join(root, 'home');
  const config = join(home, '.config');
  const repository = join(root, 'repository');
  const legacy = join(home, 'legacy.zsh');
  mkdirSync(config, { recursive: true });
  mkdirSync(join(repository, 'portable', 'zsh', 'shims'), { recursive: true });
  writeFileSync(
    join(repository, 'package.json'),
    JSON.stringify({ name: 'mzsh', version: '1.0.0' })
  );
  writeFileSync(join(repository, 'portable', 'zsh', 'init.zsh'), 'return 0\n');
  writeFileSync(legacy, 'export API_TOKEN=inert-placeholder\nexport PATH=/safe/bin\n');
  return { root, home, config, repository, legacy };
}

describe('MZSH managed CLI', () => {
  test('parses only absolute managed command paths and defaults mutations to dry run', () => {
    expect(parseArguments(['bootstrap', '--source', '/checkout'])).toEqual({
      kind: 'bootstrap',
      source: '/checkout',
      apply: false,
    });
    expect(
      parseArguments([
        'rollback',
        'receipt_1',
        '--apply',
        '--plan-id',
        '4b5fd2fd-2f80-4ce9-a8f3-5c12dfacbe49',
        '--confirm',
        'APPLY',
      ])
    ).toEqual({
      kind: 'rollback',
      receiptId: 'receipt_1',
      apply: true,
      planId: '4b5fd2fd-2f80-4ce9-a8f3-5c12dfacbe49',
      confirmation: 'APPLY',
    });
    expect(parseArguments(['bootstrap', '--source', 'relative'])).toEqual(
      expect.objectContaining({ kind: 'usage-error' })
    );
    expect(parseArguments(['audit', '--apply'])).toEqual(
      expect.objectContaining({ kind: 'usage-error' })
    );
    expect(parseArguments(['--update'])).toEqual(expect.objectContaining({ kind: 'retired' }));
  });

  test('classifies plain credential assignments without returning their name or value', () => {
    expect(classifySensitiveAssignment('export API_TOKEN=inert-placeholder')).toBe(true);
    expect(classifySensitiveAssignment('export PATH=/safe/bin')).toBe(false);
    expect(classifySensitiveAssignment('export TOKEN=$(unsafe)')).toBe(true);
    expect(classifySensitiveAssignment('export MZSH_TOKEN_LABEL=')).toBe(true);
    expect(classifySensitiveAssignment('export MZSH_AUTH_KEYRING=')).toBe(true);
    expect(classifySensitiveAssignment('export TOKEN?=')).toBe(false);
  });

  test('renders real audit reports as approved JSON or stable human findings', () => {
    const output: string[] = [];
    const dependencies = {
      home: '/home',
      xdgConfig: '/home/.config',
      xdgCache: '/home/.cache',
      repositoryRoot: '/checkout',
      write: (message: string) => output.push(message),
      probes: { collect: () => snapshot },
    };
    expect(runMzshCli(['audit', '--json'], dependencies)).toBe(0);
    expect(output[0]).toContain('REPOSITORY_MISSING');
    output.splice(0);
    expect(runMzshCli(['audit'], dependencies)).toBe(0);
    expect(output[0]).toBe(
      'WARNING REPOSITORY_MISSING The configured MZSH repository root is absent.'
    );
  });

  test('rejects duplicate flags, stray positionals, unsupported flags, and traversal', () => {
    for (const args of [
      ['bootstrap', '--source', '/a', '--source', '/b'],
      ['audit', 'extra'],
      ['update', '--legacy-source', '/a'],
      ['rollback', '../receipt'],
      ['rollback', 'receipt', '--source', '/a'],
      ['rollback', 'receipt', '--legacy-source', '/a'],
      ['rollback', 'receipt', '--json'],
      ['rollback', 'receipt', 'extra'],
    ]) {
      expect(parseArguments(args)).toEqual(expect.objectContaining({ kind: 'usage-error' }));
    }
  });

  test('resolves the managed checkout from the installed module directory', () => {
    expect(managedRepositoryRoot('/opt/mzsh/lib')).toBe('/opt/mzsh');
    expect(isManagedCliRoute(['--open-type', 'vim', '--update'])).toBe(true);
    expect(isManagedCliRoute(['--reinstall'])).toBe(true);
    expect(isManagedCliRoute(['--uninst'])).toBe(true);
  });

  test('bootstrap requires a reviewed plan ID and literal confirmation before apply', () => {
    const fixture = cliFixture();
    try {
      const output: string[] = [];
      let applied = 0;
      const dependencies = {
        home: fixture.home,
        xdgConfig: fixture.config,
        xdgCache: join(fixture.home, '.cache'),
        repositoryRoot: fixture.repository,
        write: (message: string) => output.push(message),
        id: () => 'cli-tx',
        reviewedPlanId: () => '4b5fd2fd-2f80-4ce9-a8f3-5c12dfacbe49',
        apply: () => {
          applied += 1;
          return { kind: 'applied' as const, receiptPath: join(fixture.config, 'receipt') };
        },
      };
      expect(
        runMzshCli(
          ['bootstrap', '--source', fixture.repository, '--legacy-source', fixture.legacy],
          dependencies
        )
      ).toBe(0);
      expect(applied).toBe(0);
      const summary = output[0]!;
      expect(summary).toContain('"id":"cli-tx"');
      expect(summary).toContain('"sensitiveAssignmentCount":1');
      expect(summary).toContain('"repositoryPreconditions"');
      expect(summary).toContain('"mutations"');
      expect(summary).not.toContain('API_TOKEN');
      expect(summary).not.toContain('inert-placeholder');
      expect(summary).not.toContain('export API_TOKEN');
      output.splice(0);
      expect(
        runMzshCli(
          [
            'bootstrap',
            '--source',
            fixture.repository,
            '--legacy-source',
            fixture.legacy,
            '--apply',
          ],
          dependencies
        )
      ).toBe(1);
      expect(applied).toBe(0);
      expect(output[0]).toBe('MZSH_PLAN_CONFIRMATION_REQUIRED');
      output.splice(0);
      expect(
        runMzshCli(
          [
            'bootstrap',
            '--source',
            fixture.repository,
            '--legacy-source',
            fixture.legacy,
            '--apply',
            '--plan-id',
            '4b5fd2fd-2f80-4ce9-a8f3-5c12dfacbe49',
            '--confirm',
            'APPLY',
          ],
          dependencies
        )
      ).toBe(0);
      expect(applied).toBe(1);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('update and rollback require reviewed plan confirmation for apply', () => {
    const fixture = cliFixture();
    try {
      let applied = 0;
      const rollbackPaths: string[] = [];
      const dependencies = {
        home: fixture.home,
        xdgConfig: fixture.config,
        xdgCache: join(fixture.home, '.cache'),
        repositoryRoot: fixture.repository,
        write: (_message: string) => undefined,
        id: () => 'update-tx',
        reviewedPlanId: () => '4b5fd2fd-2f80-4ce9-a8f3-5c12dfacbe50',
        rollbackStateDigest: () => 'a'.repeat(64),
        apply: () => {
          applied += 1;
          return { kind: 'applied' as const, receiptPath: 'receipt' };
        },
        rollback: (input: { receiptPath: string; dryRun: boolean }) => {
          rollbackPaths.push(`${input.receiptPath}:${input.dryRun}`);
          return input.dryRun
            ? { kind: 'ready' as const, dryRun: true as const, paths: [] }
            : { kind: 'rolled-back' as const, paths: [] };
        },
      };
      expect(runMzshCli(['update', '--source', fixture.repository], dependencies)).toBe(0);
      expect(applied).toBe(0);
      expect(runMzshCli(['update', '--source', fixture.repository, '--apply'], dependencies)).toBe(
        1
      );
      expect(
        runMzshCli(
          [
            'update',
            '--source',
            fixture.repository,
            '--apply',
            '--plan-id',
            '4b5fd2fd-2f80-4ce9-a8f3-5c12dfacbe50',
            '--confirm',
            'APPLY',
          ],
          dependencies
        )
      ).toBe(0);
      expect(applied).toBe(1);
      expect(runMzshCli(['rollback', 'receipt_1'], dependencies)).toBe(0);
      expect(runMzshCli(['rollback', 'receipt_1', '--apply'], dependencies)).toBe(1);
      expect(
        runMzshCli(
          [
            'rollback',
            'receipt_1',
            '--apply',
            '--plan-id',
            '4b5fd2fd-2f80-4ce9-a8f3-5c12dfacbe50',
            '--confirm',
            'APPLY',
          ],
          dependencies
        )
      ).toBe(0);
      expect(rollbackPaths).toEqual([
        `${join(fixture.config, 'mzsh', 'state', 'receipt_1', 'receipt.json')}:true`,
        `${join(fixture.config, 'mzsh', 'state', 'receipt_1', 'receipt.json')}:true`,
        `${join(fixture.config, 'mzsh', 'state', 'receipt_1', 'receipt.json')}:false`,
      ]);
      expect(runMzshCli(['rollback', '../escape'], dependencies)).toBe(2);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('rejects a changed rollback digest before mutation and preserves the reviewed plan', () => {
    const fixture = cliFixture();
    try {
      const rollbackPaths: string[] = [];
      let digest = 'a'.repeat(64);
      const dependencies = {
        home: fixture.home,
        xdgConfig: fixture.config,
        xdgCache: join(fixture.home, '.cache'),
        repositoryRoot: fixture.repository,
        write: (_message: string) => undefined,
        reviewedPlanId: () => '7f0b4527-2590-4c25-864d-57d484979f11',
        rollbackStateDigest: () => digest,
        rollback: (input: { receiptPath: string; dryRun: boolean }) => {
          rollbackPaths.push(`${input.receiptPath}:${input.dryRun}`);
          return input.dryRun
            ? { kind: 'ready' as const, dryRun: true as const, paths: [] }
            : { kind: 'rolled-back' as const, paths: [] };
        },
      };
      const applyArgs = [
        'rollback',
        'receipt_1',
        '--apply',
        '--plan-id',
        '7f0b4527-2590-4c25-864d-57d484979f11',
        '--confirm',
        'APPLY',
      ];

      expect(runMzshCli(['rollback', 'receipt_1'], dependencies)).toBe(0);
      digest = 'b'.repeat(64);
      expect(runMzshCli(applyArgs, dependencies)).toBe(1);
      expect(rollbackPaths).toHaveLength(1);
      digest = 'a'.repeat(64);
      expect(runMzshCli(applyArgs, dependencies)).toBe(0);
      expect(rollbackPaths.map((entry) => entry.endsWith(':false'))).toEqual([false, false, true]);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('revalidates rollback state after snapshot capture before mutation', () => {
    const fixture = cliFixture();
    try {
      const rollbackPaths: string[] = [];
      let digest = 'a'.repeat(64);
      let dryRuns = 0;
      const dependencies = {
        home: fixture.home,
        xdgConfig: fixture.config,
        xdgCache: join(fixture.home, '.cache'),
        repositoryRoot: fixture.repository,
        write: (_message: string) => undefined,
        reviewedPlanId: () => '7f0b4527-2590-4c25-864d-57d484979f12',
        rollbackStateDigest: () => digest,
        rollback: (input: { receiptPath: string; dryRun: boolean }) => {
          rollbackPaths.push(`${input.receiptPath}:${input.dryRun}`);
          if (input.dryRun) {
            dryRuns += 1;
            if (dryRuns === 2) digest = 'b'.repeat(64);
            return { kind: 'ready' as const, dryRun: true as const, paths: [] };
          }
          return { kind: 'rolled-back' as const, paths: [] };
        },
      };
      const applyArgs = [
        'rollback',
        'receipt_1',
        '--apply',
        '--plan-id',
        '7f0b4527-2590-4c25-864d-57d484979f12',
        '--confirm',
        'APPLY',
      ];

      expect(runMzshCli(['rollback', 'receipt_1'], dependencies)).toBe(0);
      expect(runMzshCli(applyArgs, dependencies)).toBe(1);
      expect(rollbackPaths.map((entry) => entry.endsWith(':false'))).toEqual([false, false]);
      digest = 'a'.repeat(64);
      expect(runMzshCli(applyArgs, dependencies)).toBe(0);
      expect(rollbackPaths.map((entry) => entry.endsWith(':false'))).toEqual([
        false,
        false,
        false,
        true,
      ]);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
