import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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

  test('end-to-end zsh shell session integration and agy delegation', () => {
    const fakeHome = join(testRoot, 'home');
    const fakeGemini = join(fakeHome, '.gemini');
    const fakeAccountsDir = join(fakeGemini, 'accounts');
    const fakeLocalBin = join(fakeHome, '.local', 'bin');
    mkdirSync(fakeAccountsDir, { recursive: true, mode: 0o700 });
    mkdirSync(fakeLocalBin, { recursive: true, mode: 0o700 });

    const vault = new AgypVault(fakeAccountsDir, fakeGemini);
    vault.addOrUpdateAccount('alice.work@corp.com', 'alice-token');
    vault.addOrUpdateAccount('bob.personal@gmail.com', 'bob-token');
    vault.setActiveAccount('alice.work@corp.com');

    const mockAgy = join(fakeLocalBin, 'agy');
    writeFileSync(
      mockAgy,
      '#!/bin/sh\nprintf "MOCK_AGY_TOKEN:%s\\n" "$JETSKI_STANDALONE_OAUTH_TOKEN_PATH"\n',
      { mode: 0o755 }
    );
    chmodSync(mockAgy, 0o755);

    const agypZshModule = join(process.cwd(), 'portable', 'zsh', 'modules', 'agyp.zsh');

    const zshScript = `
export HOME="${fakeHome}"
export PATH="${fakeLocalBin}:$PATH"
source "${agypZshModule}"

# Verify active account routing before switch
agy

# Switch to bob via fuzzy prefix
agyp bob

# Print exported shell state and call agy again
printf "EXPORTED_AGY_ACCOUNT:%s\\n" "$AGY_ACCOUNT"
agy
`;

    const res = spawnSync('zsh', ['-f', '-i', '-c', zshScript], {
      env: {
        ...process.env,
        HOME: fakeHome,
        PATH: `${fakeLocalBin}:${process.env.PATH}`,
      },
      encoding: 'utf8',
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain('MOCK_AGY_TOKEN:' + vault.getTokenPath('alice.work@corp.com'));
    expect(res.stdout).toContain('bob.personal@gmail.com');
    expect(res.stdout).toContain('EXPORTED_AGY_ACCOUNT:bob.personal@gmail.com');
    expect(res.stdout).toContain('MOCK_AGY_TOKEN:' + vault.getTokenPath('bob.personal@gmail.com'));
  });
});
