import { describe, expect, test } from 'bun:test';
import { InventoryService } from '../../../src/application/inventory-service';
import { runMzshCli } from '../../../src/cli/run-cli';
import { CategoryRegistry } from '../../../src/domain/categories';
import type { EnvironmentSnapshot } from '../../../src/domain/audit';
import { InventoryProbes, type ProcessRunner } from '../../../src/infrastructure/inventory-probes';
import type { InventoryProvider, InventoryRecord } from '../../../src/domain/inventory';

class FakeProcess implements ProcessRunner {
  readonly calls: string[][] = [];

  run(argv: readonly string[]): { status: number; output: string } {
    this.calls.push([...argv]);
    return { status: 0, output: '1.0.0\n' };
  }
}

function registry(): CategoryRegistry {
  return new CategoryRegistry([
    { id: 'applications', label: 'Applications' },
    { id: 'runtimes', label: 'Runtimes' },
    { id: 'managers', label: 'Managers' },
    { id: 'shell', label: 'Shell' },
    { id: 'scripts', label: 'Scripts' },
    { id: 'path', label: 'PATH' },
    { id: 'environment', label: 'Environment metadata' },
  ]);
}

function snapshot(): EnvironmentSnapshot {
  return {
    roots: {
      home: '/isolated/home',
      xdgConfig: '/isolated/home/.config',
      xdgCache: '/isolated/home/.cache',
      repository: '/isolated/repository',
    },
    repository: {
      kind: 'present',
      root: '/isolated/repository',
      packageName: 'mzsh',
      portableEntrypoint: '/isolated/repository/portable/zsh/init.zsh',
    },
    pathEntries: [{ path: '/isolated/bin' }, { path: '/isolated/bin' }],
    zshTopology: 'modular',
    currentLink: 'valid',
    privateFile: { kind: 'file', assignmentCount: 2 },
    nodeOwnership: { nvmInteractive: false, homebrewPrivateNode: false },
    pnpm: { status: 'absent', globalBinDiscoverable: false },
    java: { status: 'not-applicable' },
    commands: [],
    probeFailures: [],
  };
}

describe('inventory service', () => {
  test('reports runtime origin and version without invoking a package manager mutation', () => {
    const fakeProcess = new FakeProcess();
    const service = new InventoryService(registry(), [new InventoryProbes(fakeProcess)]);

    const records = service.collect({ categoryId: 'runtimes', snapshot: snapshot() });

    expect(records[0]).toMatchObject({
      categoryId: 'runtimes',
      origin: 'path',
      version: '1.0.0',
    });
    expect(fakeProcess.calls).toEqual([['bun', '--version']]);
  });

  test('summarizes PATH and environment metadata without retaining observed values', () => {
    const service = new InventoryService(registry(), []);

    const records = service.collect({ snapshot: snapshot() });

    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          categoryId: 'path',
          metadata: { duplicateEntries: 1, entryCount: 2 },
        }),
        expect.objectContaining({
          categoryId: 'environment',
          metadata: { privateAssignmentCount: 2, privateOverride: 'present' },
        }),
      ])
    );
    expect(JSON.stringify(records)).not.toContain('/isolated/bin');
    expect(JSON.stringify(records)).not.toContain('/isolated/home');
  });

  test('renders a filtered inventory category through the read-only JSON CLI route', () => {
    const output: string[] = [];
    const inventory = new InventoryService(registry(), [new InventoryProbes(new FakeProcess())]);

    expect(
      runMzshCli(['inventory', 'runtimes', '--json'], {
        home: '/isolated/home',
        xdgConfig: '/isolated/home/.config',
        xdgCache: '/isolated/home/.cache',
        repositoryRoot: '/isolated/repository',
        probes: { collect: snapshot },
        inventory,
        write: (message) => output.push(message),
      })
    ).toBe(0);
    expect(JSON.parse(output[0] ?? '[]')).toEqual([
      expect.objectContaining({ categoryId: 'runtimes', name: 'bun', version: '1.0.0' }),
    ]);
  });

  test('blocks provider-derived values and path-like data from inventory CLI output', () => {
    const output: string[] = [];
    const unsafeRecord: InventoryRecord = {
      categoryId: 'runtimes',
      name: '/private/tool-token',
      status: 'present',
      origin: 'path',
      version: 'private-value',
      metadata: { location: '/private/path', token: 'private-value' },
    };
    const unsafeProvider: InventoryProvider = { collect: () => [unsafeRecord] };

    expect(
      runMzshCli(['inventory', '--json'], {
        home: '/isolated/home',
        xdgConfig: '/isolated/home/.config',
        xdgCache: '/isolated/home/.cache',
        repositoryRoot: '/isolated/repository',
        probes: { collect: snapshot },
        inventory: { collect: () => unsafeProvider.collect({}) },
        write: (message) => output.push(message),
      })
    ).toBe(0);
    expect(output).toEqual(['[]']);
    expect(output.join('\n')).not.toContain('/private/path');
    expect(output.join('\n')).not.toContain('private-value');
    output.splice(0);
    expect(
      runMzshCli(['inventory'], {
        home: '/isolated/home',
        xdgConfig: '/isolated/home/.config',
        xdgCache: '/isolated/home/.cache',
        repositoryRoot: '/isolated/repository',
        probes: { collect: snapshot },
        inventory: { collect: () => unsafeProvider.collect({}) },
        write: (message) => output.push(message),
      })
    ).toBe(0);
    expect(output).toEqual([]);
  });
});
