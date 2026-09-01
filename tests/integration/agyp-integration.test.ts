import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AgypVault } from '../../src/domain/agyp/agyp-vault';
import { AgypService } from '../../src/infrastructure/agyp/agyp-service';

describe('agyp multi-account integration', () => {
  const testRoot = join(process.cwd(), '.tmp', `test-agyp-int-${Date.now()}`);
  const customVault = join(testRoot, 'accounts');
  const customGemini = join(testRoot, 'gemini');

  beforeEach(() => {
    mkdirSync(customVault, { recursive: true, mode: 0o700 });
    mkdirSync(customGemini, { recursive: true, mode: 0o700 });
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  test('full multi-account onboarding and switching lifecycle', async () => {
    // 1. Initial global token state
    const fakeAccounts = {
      primaryEmail: 'onurseckinsenoglu@gmail.com',
      accounts: [{ email: 'onurseckinsenoglu@gmail.com' }],
    };
    writeFileSync(join(customGemini, 'google_accounts.json'), JSON.stringify(fakeAccounts));
    writeFileSync(join(customGemini, 'jetski-standalone-oauth-token'), 'token-primary');

    const vault = new AgypVault(customVault, customGemini);
    const service = new AgypService(vault);

    // 2. Add second account
    const secondDir = vault.getAccountDir('onurssenoglu@gmail.com');
    mkdirSync(secondDir, { recursive: true });
    writeFileSync(vault.getTokenPath('onurssenoglu@gmail.com'), 'token-secondary');

    const registry = vault.readRegistry();
    registry.accounts.push({
      email: 'onurssenoglu@gmail.com',
      addedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    });
    vault.writeRegistry(registry);

    // 3. List accounts
    const listResult = service.listAccounts();
    expect(listResult.success).toBeTrue();
    expect(listResult.payload).toContain('onurseckinsenoglu@gmail.com');
    expect(listResult.payload).toContain('onurssenoglu@gmail.com');

    // 4. Switch to second account
    const switchResult = await service.pickOrSwitch('onurssenoglu@gmail.com');
    expect(switchResult.success).toBeTrue();
    expect(switchResult.action).toBe('export');
    expect(switchResult.payload).toContain('export AGY_ACCOUNT="onurssenoglu@gmail.com"');
    expect(switchResult.payload).toContain('jetski-standalone-oauth-token');

    // 5. Verify current active account
    const currentResult = service.currentAccount();
    expect(currentResult.success).toBeTrue();
    expect(currentResult.payload).toBe('onurssenoglu@gmail.com');
  });
});
