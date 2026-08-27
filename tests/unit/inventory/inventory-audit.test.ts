import { describe, expect, test } from 'bun:test';
import { auditEnvironment } from '../../../src/application/audit-environment';
import type { EnvironmentSnapshot } from '../../../src/domain/audit';
import type { InventoryRecord } from '../../../src/domain/inventory';

function snapshot(): EnvironmentSnapshot {
  return {
    roots: {
      home: '/isolated/home',
      xdgConfig: '/isolated/home/.config',
      xdgCache: '/isolated/home/.cache',
      repository: '/isolated/repository',
    },
    repository: { kind: 'missing', root: '/isolated/repository', reason: 'root-absent' },
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
}

describe('inventory audit integration', () => {
  test('includes only redacted inventory metadata in audit output', () => {
    const inventory: InventoryRecord[] = [
      {
        categoryId: 'path',
        name: 'raw-path-entry',
        status: 'present',
        origin: 'environment',
        version: '1.2.3',
        metadata: { entryCount: 2, privateValue: 'inert-secret' },
      },
    ];

    const report = auditEnvironment(snapshot(), inventory);

    expect(report.inventory).toEqual([
      {
        categoryId: 'path',
        status: 'present',
        origin: 'environment',
        version: '1.2.3',
        metadata: { entryCount: 2 },
      },
    ]);
    expect(JSON.stringify(report)).not.toContain('raw-path-entry');
    expect(JSON.stringify(report)).not.toContain('inert-secret');
  });
});
