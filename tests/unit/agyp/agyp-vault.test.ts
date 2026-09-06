import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AgypPaths } from '../../../src/domain/agyp/agyp-paths';
import { AgypVault } from '../../../src/domain/agyp/agyp-vault';
import type { QuotaSnapshot } from '../../../src/domain/agyp/agyp-types';

const testRoot = join(process.cwd(), '.tmp', `agyp-vault-${Date.now()}`);

function makeVault(): { vault: AgypVault; paths: AgypPaths } {
  const paths = new AgypPaths(join(testRoot, 'home'), join(testRoot, 'vault'));
  return { vault: new AgypVault(paths), paths };
}

function snapshot(email: string, remaining: number): QuotaSnapshot {
  return {
    email,
    planName: 'Pro',
    gemini: { remainingPercentage: remaining, resetTime: null, modelCount: 1 },
    capturedAt: new Date().toISOString(),
    source: 'live_session',
  };
}

describe('AgypVault', () => {
  beforeEach(() => {
    mkdirSync(join(testRoot, 'vault'), { recursive: true, mode: 0o700 });
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  test('starts empty', () => {
    const { vault } = makeVault();
    const registry = vault.readRegistry();
    expect(registry.version).toBe(2);
    expect(registry.globalAccount).toBeNull();
    expect(registry.accounts).toHaveLength(0);
  });

  test('registers an account and adopts it as the global default', () => {
    const { vault } = makeVault();
    const created = vault.registerAccount('Person@Example.com');

    expect(created.email).toBe('person@example.com');
    expect(vault.getGlobalAccount()).toBe('person@example.com');
    expect(vault.hasAccount('PERSON@example.com')).toBeTrue();
  });

  test('keeps the first account as global when a second is added', () => {
    const { vault } = makeVault();
    vault.registerAccount('first@example.com');
    vault.registerAccount('second@example.com');

    expect(vault.getGlobalAccount()).toBe('first@example.com');
    expect(vault.listAccounts()).toHaveLength(2);
  });

  test('re-registering an existing account does not duplicate it', () => {
    const { vault } = makeVault();
    vault.registerAccount('person@example.com');
    vault.registerAccount('person@example.com');

    expect(vault.listAccounts()).toHaveLength(1);
  });

  test('removing the global account promotes a survivor', () => {
    const { vault } = makeVault();
    vault.registerAccount('first@example.com');
    vault.registerAccount('second@example.com');

    expect(vault.removeAccount('first@example.com')).toBeTrue();
    expect(vault.getGlobalAccount()).toBe('second@example.com');
  });

  test('removing the last account clears the global default', () => {
    const { vault } = makeVault();
    vault.registerAccount('only@example.com');
    vault.removeAccount('only@example.com');

    expect(vault.getGlobalAccount()).toBeNull();
  });

  test('reads a version 1 registry as a version 2 one', () => {
    const { vault, paths } = makeVault();
    writeFileSync(
      paths.registryPath,
      JSON.stringify({
        version: 1,
        activeAccount: 'legacy@example.com',
        accounts: [
          {
            email: 'legacy@example.com',
            addedAt: '2026-01-01T00:00:00Z',
            lastUsedAt: '2026-01-01T00:00:00Z',
          },
        ],
      })
    );

    const registry = vault.readRegistry();
    expect(registry.version).toBe(2);
    expect(registry.globalAccount).toBe('legacy@example.com');
    expect(registry.accounts).toHaveLength(1);
  });

  test('preserves an unreadable registry instead of discarding it', () => {
    const { vault, paths } = makeVault();
    writeFileSync(paths.registryPath, '{ not json');

    expect(vault.listAccounts()).toHaveLength(0);
    const preserved = readFileSync(paths.registryPath, 'utf8');
    expect(preserved).toBe('{ not json');
  });

  test('remembers and recalls a quota reading, marking it cached', () => {
    const { vault } = makeVault();
    vault.rememberQuota(snapshot('person@example.com', 42));

    const recalled = vault.recallQuota('person@example.com');
    expect(recalled?.gemini?.remainingPercentage).toBe(42);
    expect(recalled?.source).toBe('cache');
  });

  test('forgets the quota reading when an account is removed', () => {
    const { vault } = makeVault();
    vault.registerAccount('person@example.com');
    vault.rememberQuota(snapshot('person@example.com', 42));
    vault.removeAccount('person@example.com');

    expect(vault.recallQuota('person@example.com')).toBeNull();
  });

  test('matches accounts by prefix', () => {
    const { vault } = makeVault();
    vault.registerAccount('work.person@example.com');
    vault.registerAccount('home.person@example.com');

    expect(vault.findAccount('work').account?.email).toBe('work.person@example.com');
    expect(vault.findAccount('person').error).toContain('Ambiguous');
  });
});
