import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AgypVault } from '../../../src/domain/agyp/agyp-vault';

describe('AgypVault', () => {
  const testRoot = join(process.cwd(), '.tmp', `test-vault-${Date.now()}`);
  const customVault = join(testRoot, 'accounts');
  const customGemini = join(testRoot, 'gemini');

  beforeEach(() => {
    mkdirSync(customVault, { recursive: true, mode: 0o700 });
    mkdirSync(customGemini, { recursive: true, mode: 0o700 });
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  test('reads empty registry by default', () => {
    const vault = new AgypVault(customVault, customGemini);
    const registry = vault.readRegistry();
    expect(registry.version).toBe(1);
    expect(registry.activeAccount).toBeNull();
    expect(registry.accounts).toHaveLength(0);
  });

  test('auto-imports existing token from gemini dir', () => {
    const fakeAccounts = {
      primaryEmail: 'user@example.com',
      accounts: [{ email: 'user@example.com', name: 'User' }],
    };
    writeFileSync(join(customGemini, 'google_accounts.json'), JSON.stringify(fakeAccounts));
    writeFileSync(join(customGemini, 'jetski-standalone-oauth-token'), 'fake-token-content');

    const vault = new AgypVault(customVault, customGemini);
    const imported = vault.autoImportExistingToken();

    expect(imported).toBeTrue();
    const accounts = vault.listAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.email).toBe('user@example.com');
    expect(vault.getActiveAccount()).toBe('user@example.com');

    const envExport = vault.getEnvironmentExport('user@example.com');
    expect(envExport).not.toBeNull();
    expect(envExport?.exportScript).toContain('export AGY_ACCOUNT="user@example.com"');
    expect(envExport?.exportScript).toContain('export JETSKI_STANDALONE_OAUTH_TOKEN_PATH=');
  });

  test('switches active account and updates lastUsedAt', () => {
    const vault = new AgypVault(customVault, customGemini);
    vault.writeRegistry({
      version: 1,
      activeAccount: 'first@gmail.com',
      accounts: [
        {
          email: 'first@gmail.com',
          addedAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
        {
          email: 'second@gmail.com',
          addedAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    const switched = vault.setActiveAccount('second@gmail.com');
    expect(switched).toBeTrue();
    expect(vault.getActiveAccount()).toBe('second@gmail.com');
  });

  test('removes account and cleans directory', () => {
    const vault = new AgypVault(customVault, customGemini);
    vault.writeRegistry({
      version: 1,
      activeAccount: 'first@gmail.com',
      accounts: [
        {
          email: 'first@gmail.com',
          addedAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    const accountDir = vault.getAccountDir('first@gmail.com');
    mkdirSync(accountDir, { recursive: true });

    const removed = vault.removeAccount('first@gmail.com');
    expect(removed).toBeTrue();
    expect(vault.listAccounts()).toHaveLength(0);
    expect(vault.getActiveAccount()).toBeNull();
  });
});
