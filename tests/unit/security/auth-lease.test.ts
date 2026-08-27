import { describe, expect, test } from 'bun:test';
import { AuthLeaseService } from '../../../src/application/auth-lease';
import type {
  AuthLeaseMetadata,
  AuthLeaseStore,
  OperatingSystemAuthorization,
} from '../../../src/domain/auth';

class LeaseStore implements AuthLeaseStore {
  value: AuthLeaseMetadata | undefined;

  load(): AuthLeaseMetadata | undefined {
    return this.value;
  }

  save(value: AuthLeaseMetadata): void {
    this.value = value;
  }
}

class Authorization implements OperatingSystemAuthorization {
  attempts = 0;

  authorize(_owner: string): boolean {
    this.attempts += 1;
    return true;
  }
}

describe('authentication lease', () => {
  test('stores only owner-safe metadata for the default twenty-four-hour lease', () => {
    const authorization = new Authorization();
    const store = new LeaseStore();
    const now = new Date('2026-08-27T12:00:00.000Z');
    const service = new AuthLeaseService({
      authorization,
      store,
      owner: () => 'local-owner',
      now: () => now,
    });

    expect(service.acquire()).toEqual({
      owner: 'local-owner',
      expiresAt: '2026-08-28T12:00:00.000Z',
    });
    expect(authorization.attempts).toBe(1);
    expect(JSON.stringify(store.value)).not.toContain('private');
  });

  test('requires fresh operating-system authorization after expiry', () => {
    const authorization = new Authorization();
    const store = new LeaseStore();
    let now = new Date('2026-08-27T12:00:00.000Z');
    const service = new AuthLeaseService({
      authorization,
      store,
      owner: () => 'local-owner',
      now: () => now,
    });

    service.acquire();
    now = new Date('2026-08-28T12:00:00.001Z');
    service.acquire();

    expect(authorization.attempts).toBe(2);
  });

  test('rejects unsafe owner metadata before requesting authorization', () => {
    const authorization = new Authorization();
    const service = new AuthLeaseService({
      authorization,
      store: new LeaseStore(),
      owner: () => 'unsafe/owner',
      now: () => new Date('2026-08-27T12:00:00.000Z'),
    });

    expect(() => service.acquire()).toThrow('AUTH_LEASE_OWNER_INVALID');
    expect(authorization.attempts).toBe(0);
  });
});
