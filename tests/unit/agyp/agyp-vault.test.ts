import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

  test('adds or updates account with token content', () => {
    const vault = new AgypVault(customVault, customGemini);
    const added = vault.addOrUpdateAccount('newuser@gmail.com', 'new-token-content');
    expect(added).toBeTrue();
    expect(vault.listAccounts()).toHaveLength(1);
    expect(vault.getActiveAccount()).toBe('newuser@gmail.com');
  });

  test('preserves backup when registry.json is corrupt', () => {
    const registryPath = join(customVault, 'registry.json');
    writeFileSync(registryPath, 'INVALID_JSON_DATA_CORRUPT');

    const vault = new AgypVault(customVault, customGemini);
    const accounts = vault.listAccounts();
    expect(accounts).toHaveLength(0);

    // Verify corrupt backup was generated
    const files = readdirSync(customVault);
    const corruptBackup = files.find((f) => f.startsWith('registry.json.corrupt.'));
    expect(corruptBackup).toBeDefined();
  });

  test('auto-imports from standalone JWT token when google_accounts.json is absent', () => {
    // Generate sample mock JWT with email claim
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64');
    const payload = Buffer.from(
      JSON.stringify({ email: 'jwt-user@example.com', sub: '12345' })
    ).toString('base64');
    const signature = 'sample_signature';
    const jwtToken = `${header}.${payload}.${signature}`;

    writeFileSync(join(customGemini, 'jetski-standalone-oauth-token'), jwtToken);

    const vault = new AgypVault(customVault, customGemini);
    const imported = vault.autoImportExistingToken();

    expect(imported).toBeTrue();
    const accounts = vault.listAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.email).toBe('jwt-user@example.com');
  });

  test('auto-import is strictly idempotent and does not rewrite existing matched state', () => {
    const fakeAccounts = {
      primaryEmail: 'idempotent@example.com',
      accounts: [{ email: 'idempotent@example.com' }],
    };
    writeFileSync(join(customGemini, 'google_accounts.json'), JSON.stringify(fakeAccounts));
    writeFileSync(join(customGemini, 'jetski-standalone-oauth-token'), 'static-token');

    const vault = new AgypVault(customVault, customGemini);
    const firstImport = vault.autoImportExistingToken();
    expect(firstImport).toBeTrue();

    const initialRegistry = vault.readRegistry();
    const initialAddedAt = initialRegistry.accounts[0]?.addedAt;

    // Call multiple times
    vault.autoImportExistingToken();
    vault.listAccounts();
    vault.getActiveAccount();

    const finalRegistry = vault.readRegistry();
    expect(finalRegistry.accounts).toHaveLength(1);
    expect(finalRegistry.accounts[0]?.addedAt).toBe(initialAddedAt);
  });

  test('findAccount performs exact, prefix, and substring resolution', () => {
    const vault = new AgypVault(customVault, customGemini);
    vault.writeRegistry({
      version: 1,
      activeAccount: 'alice.work@corp.com',
      accounts: [
        {
          email: 'alice.work@corp.com',
          addedAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
        {
          email: 'bob.personal@gmail.com',
          addedAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
        {
          email: 'bob.work@corp.com',
          addedAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    // Exact
    const exact = vault.findAccount('alice.work@corp.com');
    expect(exact.account?.email).toBe('alice.work@corp.com');

    // Prefix unique
    const prefix = vault.findAccount('alice');
    expect(prefix.account?.email).toBe('alice.work@corp.com');

    // Substring unique
    const substr = vault.findAccount('personal');
    expect(substr.account?.email).toBe('bob.personal@gmail.com');

    // Ambiguous prefix
    const ambiguous = vault.findAccount('bob');
    expect(ambiguous.account).toBeNull();
    expect(ambiguous.error).toContain('Ambiguous');

    // Unknown
    const unknown = vault.findAccount('charlie');
    expect(unknown.account).toBeNull();
    expect(unknown.error).toContain('not found in vault');
  });

  test('canonicalizes email casing and trims token whitespace', () => {
    const vault = new AgypVault(customVault, customGemini);
    vault.addOrUpdateAccount('  User.NAME@Example.COM  ', '  token-with-newlines\n\n  ');

    expect(vault.getActiveAccount()).toBe('user.name@example.com');
    const accounts = vault.listAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.email).toBe('user.name@example.com');

    const tokenContent = readFileSync(vault.getTokenPath('User.NAME@Example.COM'), 'utf8');
    expect(tokenContent).toBe('token-with-newlines');

    // Switch using different casing
    const switched = vault.setActiveAccount('USER.NAME@EXAMPLE.COM');
    expect(switched).toBeTrue();
  });
});
