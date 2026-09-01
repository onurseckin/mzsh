import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
});
