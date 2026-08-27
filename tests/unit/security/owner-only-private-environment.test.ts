import { describe, expect, test } from 'bun:test';
import type { RegularFileSnapshot } from '../../../src/infrastructure/adoption-filesystem';
import {
  OwnerOnlyPrivateEnvironment,
  type PrivateEnvironmentFilesystem,
} from '../../../src/infrastructure/owner-only-private-environment';

function snapshot(path: string): RegularFileSnapshot {
  return {
    bytes: new Uint8Array(),
    text: 'export SERVICE_TOKEN=\n',
    state: { path, kind: 'file', mode: 0o600, ownerId: 501, hash: 'a'.repeat(64) },
  };
}

class BoundaryFilesystem implements PrivateEnvironmentFilesystem {
  constructor(
    private readonly parentSafe: boolean,
    private readonly read: (path: string) => RegularFileSnapshot
  ) {}

  hasSafeAtomicParent(_path: string): boolean {
    return this.parentSafe;
  }

  currentUserId(): number | undefined {
    return 501;
  }

  readRegularUtf8NoFollow(path: string): RegularFileSnapshot {
    return this.read(path);
  }
}

describe('owner-only private environment', () => {
  test('reads names from a descriptor-bound owner-only private file', () => {
    const path = '/safe/private.zsh';
    const boundary = new OwnerOnlyPrivateEnvironment(
      path,
      () => undefined,
      new BoundaryFilesystem(true, snapshot)
    );

    expect(boundary.listNames()).toEqual(['SERVICE_TOKEN']);
  });

  test('rejects an unsafe parent before reading or opening the boundary', () => {
    let reads = 0;
    let opened = 0;
    const boundary = new OwnerOnlyPrivateEnvironment(
      '/unsafe/private.zsh',
      () => {
        opened += 1;
      },
      new BoundaryFilesystem(false, () => {
        reads += 1;
        return snapshot('/unsafe/private.zsh');
      })
    );

    expect(() => boundary.requestSet('SERVICE_TOKEN')).toThrow(
      'PRIVATE_ENVIRONMENT_BOUNDARY_REQUIRED'
    );
    expect(reads).toBe(0);
    expect(opened).toBe(0);
  });

  test('rejects a symlink swap reported by no-follow descriptor reading before opening', () => {
    let opened = 0;
    const boundary = new OwnerOnlyPrivateEnvironment(
      '/safe/private.zsh',
      () => {
        opened += 1;
      },
      new BoundaryFilesystem(true, () => {
        throw new Error('ELOOP');
      })
    );

    expect(() => boundary.requestSet('SERVICE_TOKEN')).toThrow(
      'PRIVATE_ENVIRONMENT_BOUNDARY_REQUIRED'
    );
    expect(opened).toBe(0);
  });

  test('refuses a post-validation pre-launch swap when no safe editor handoff exists', () => {
    let opened = 0;
    const boundary = new OwnerOnlyPrivateEnvironment(
      '/safe/private.zsh',
      () => {
        opened += 1;
      },
      new BoundaryFilesystem(true, snapshot)
    );

    expect(() => boundary.requestSet('SERVICE_TOKEN')).toThrow(
      'PRIVATE_ENVIRONMENT_SECURE_HANDOFF_REQUIRED'
    );
    expect(opened).toBe(0);
  });
});
