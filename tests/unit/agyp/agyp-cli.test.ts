import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AgypVault } from '../../../src/domain/agyp/agyp-vault';
import { AgypService } from '../../../src/infrastructure/agyp/agyp-service';
import { AgypCli } from '../../../src/cli/agyp-cli';

describe('AgypCli', () => {
  const testRoot = join(process.cwd(), '.tmp', `test-cli-${Date.now()}`);
  const customVault = join(testRoot, 'accounts');
  const customGemini = join(testRoot, 'gemini');

  let vault: AgypVault;
  let service: AgypService;
  let cli: AgypCli;

  beforeEach(() => {
    mkdirSync(customVault, { recursive: true, mode: 0o700 });
    mkdirSync(customGemini, { recursive: true, mode: 0o700 });
    vault = new AgypVault(customVault, customGemini);
    service = new AgypService(vault);
    cli = new AgypCli(service);
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  test('prints help when requested', async () => {
    const exitCode = await cli.run(['--help']);
    expect(exitCode).toBe(0);
  });

  test('handles list and current commands', async () => {
    vault.writeRegistry({
      version: 1,
      activeAccount: 'test@example.com',
      accounts: [
        {
          email: 'test@example.com',
          addedAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    const listCode = await cli.run(['list']);
    expect(listCode).toBe(0);

    const currentCode = await cli.run(['current']);
    expect(currentCode).toBe(0);
  });

  test('handles use command and switches account', async () => {
    const tokenPath = vault.getTokenPath('user@example.com');
    mkdirSync(vault.getAccountDir('user@example.com'), { recursive: true });
    writeFileSync(tokenPath, 'sample-token');

    vault.writeRegistry({
      version: 1,
      activeAccount: null,
      accounts: [
        {
          email: 'user@example.com',
          addedAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    const exitCode = await cli.run(['use', 'user@example.com']);
    expect(exitCode).toBe(0);
    expect(vault.getActiveAccount()).toBe('user@example.com');
  });

  test('handles remove command', async () => {
    vault.writeRegistry({
      version: 1,
      activeAccount: 'rem@example.com',
      accounts: [
        {
          email: 'rem@example.com',
          addedAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    const exitCode = await cli.run(['remove', 'rem@example.com']);
    expect(exitCode).toBe(0);
    expect(vault.listAccounts()).toHaveLength(0);
  });

  test('handles add command', async () => {
    const exitCode = await cli.run(['add', 'new@example.com', 'sample-token-data']);
    expect(exitCode).toBe(0);
    expect(vault.getActiveAccount()).toBe('new@example.com');
  });

  test('cleans staging directories on login abort or failure', async () => {
    const result = await service.loginAccount('test-fail@example.com', () => false);
    expect(result.success).toBeFalse();

    // Verify no orphaned .staging_* directories remain in vault root
    const entries = readdirSync(customVault);
    const stagingDirs = entries.filter((e) => e.startsWith('.staging_'));
    expect(stagingDirs).toHaveLength(0);
  });

  test('successfully registers account and cleans staging sandbox on successful login', async () => {
    const result = await service.loginAccount('auth-user@example.com', (tokenPath) => {
      writeFileSync(tokenPath, 'authenticated-token-secret');
      return true;
    });

    expect(result.success).toBeTrue();
    expect(vault.getActiveAccount()).toBe('auth-user@example.com');
    expect(vault.listAccounts()).toHaveLength(1);

    // Verify no orphaned .staging_* directories remain in vault root
    const entries = readdirSync(customVault);
    const stagingDirs = entries.filter((e) => e.startsWith('.staging_'));
    expect(stagingDirs).toHaveLength(0);
  });

  test('discovers email automatically from google_accounts and oauth_creds in login flow', async () => {
    const result = await service.loginAccount(undefined, (tokenPath) => {
      writeFileSync(tokenPath, 'token-from-browser');
      const stagingGemini = join(tokenPath, '..');
      writeFileSync(
        join(stagingGemini, 'google_accounts.json'),
        JSON.stringify({ active: 'discovered@example.com' })
      );
      writeFileSync(
        join(stagingGemini, 'oauth_creds.json'),
        JSON.stringify({ email: 'discovered@example.com', access_token: 'discovered-token' })
      );
      return true;
    });

    expect(result.success).toBeTrue();
    expect(vault.getActiveAccount()).toBe('discovered@example.com');
    expect(vault.listAccounts()).toHaveLength(1);
    expect(vault.listAccounts()[0]?.email).toBe('discovered@example.com');
  });

  test('switches accounts using fuzzy prefix or direct command', async () => {
    mkdirSync(vault.getAccountDir('primary.user@corp.com'), { recursive: true });
    writeFileSync(vault.getTokenPath('primary.user@corp.com'), 'primary-token');

    vault.writeRegistry({
      version: 1,
      activeAccount: null,
      accounts: [
        {
          email: 'primary.user@corp.com',
          addedAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    // Fuzzy via `agyp use primary`
    const exit1 = await cli.run(['use', 'primary']);
    expect(exit1).toBe(0);
    expect(vault.getActiveAccount()).toBe('primary.user@corp.com');

    // Fuzzy via direct argument `agyp corp`
    const exit2 = await cli.run(['corp']);
    expect(exit2).toBe(0);
    expect(vault.getActiveAccount()).toBe('primary.user@corp.com');
  });

  test('synchronizes active account environment on logout', () => {
    mkdirSync(vault.getAccountDir('acc1@corp.com'), { recursive: true });
    mkdirSync(vault.getAccountDir('acc2@corp.com'), { recursive: true });
    writeFileSync(vault.getTokenPath('acc1@corp.com'), 'token1');
    writeFileSync(vault.getTokenPath('acc2@corp.com'), 'token2');

    vault.writeRegistry({
      version: 1,
      activeAccount: 'acc1@corp.com',
      accounts: [
        {
          email: 'acc1@corp.com',
          addedAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
        {
          email: 'acc2@corp.com',
          addedAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    // Removing active account when secondary exists promotes secondary
    const result1 = service.removeAccount('acc1');
    expect(result1.success).toBeTrue();
    expect(result1.action).toBe('export');
    expect(result1.payload).toContain('export AGY_ACCOUNT="acc2@corp.com"');

    // Removing remaining active account returns unset directives
    const result2 = service.removeAccount('acc2');
    expect(result2.success).toBeTrue();
    expect(result2.action).toBe('export');
    expect(result2.payload).toContain('unset AGY_ACCOUNT');
    expect(result2.payload).toContain('unset JETSKI_STANDALONE_OAUTH_TOKEN_PATH');
  });

  test('handles ambiguous query by returning exit code 1', async () => {
    mkdirSync(vault.getAccountDir('user.dev@corp.com'), { recursive: true });
    mkdirSync(vault.getAccountDir('user.prod@corp.com'), { recursive: true });
    writeFileSync(vault.getTokenPath('user.dev@corp.com'), 'token-dev');
    writeFileSync(vault.getTokenPath('user.prod@corp.com'), 'token-prod');

    vault.writeRegistry({
      version: 1,
      activeAccount: null,
      accounts: [
        {
          email: 'user.dev@corp.com',
          addedAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
        {
          email: 'user.prod@corp.com',
          addedAt: '2026-01-01T00:00:00Z',
          lastUsedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    const exitCode = await cli.run(['user']);
    expect(exitCode).toBe(1);
  });

  test('displays educational onboarding guidance when vault is empty', () => {
    const listResult = service.listAccounts();
    expect(listResult.success).toBeTrue();
    expect(listResult.payload).toBe(
      'No registered accounts found. Run `agyp login` to add an account.'
    );

    const currentResult = service.currentAccount();
    expect(currentResult.success).toBeFalse();
    expect(currentResult.message).toBe('No active account set.');
  });
});
