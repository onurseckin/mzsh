import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildHarness,
  fakeHome,
  invoke,
  snapshotFor,
  testRoot,
  type Harness,
} from './agyp-cli-harness';

describe('AgypCli non-interactive surface', () => {
  beforeEach(() => {
    mkdirSync(join(fakeHome, 'Library', 'Keychains'), { recursive: true });
    mkdirSync(join(testRoot, 'vault'), { recursive: true });
    delete process.env.AGYP_ACCOUNT;
    delete process.env.AGYP_NO_TUI;
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
    delete process.env.AGYP_ACCOUNT;
    delete process.env.AGYP_NO_TUI;
  });

  function withAccounts(): Harness {
    const harness = buildHarness();
    harness.vault.registerAccount('low@example.com');
    harness.vault.registerAccount('high@example.com');
    for (const email of ['low@example.com', 'high@example.com']) {
      harness.shadow.ensure(email, true);
      harness.keychain.writeCredential(harness.paths.shadowKeychain(email), 'credential');
    }
    harness.probe.snapshots.set('low@example.com', snapshotFor('low@example.com', 4));
    harness.probe.snapshots.set('high@example.com', snapshotFor('high@example.com', 90));
    return harness;
  }

  test('--json emits a parseable envelope naming the command', async () => {
    const { cli, vault } = buildHarness();
    vault.registerAccount('person@example.com');

    const result = await invoke(cli, ['list', '--json']);
    const parsed = JSON.parse(result.out) as { ok: boolean; command: string; accounts: unknown[] };
    expect(parsed.ok).toBeTrue();
    expect(parsed.command).toBe('list');
    expect(parsed.accounts).toHaveLength(1);
  });

  test('use --json reports the environment a caller must apply', async () => {
    const { cli, vault, paths, keychain, shadow } = buildHarness();
    vault.registerAccount('person@example.com');
    shadow.ensure('person@example.com', true);
    keychain.writeCredential(paths.shadowKeychain('person@example.com'), 'credential');

    const result = await invoke(cli, ['use', 'person', '--json']);
    const parsed = JSON.parse(result.out) as { env: Record<string, string> };
    expect(parsed.env.AGYP_ACCOUNT).toBe('person@example.com');
    expect(parsed.env.AGYP_HOME).toBe(paths.shadowHome('person@example.com'));
  });

  test('a failure reports ok false with the reason inside the envelope', async () => {
    const { cli } = buildHarness();
    const result = await invoke(cli, ['use', 'nobody', '--json']);

    expect(result.code).toBe(1);
    const parsed = JSON.parse(result.out) as { ok: boolean; error: string };
    expect(parsed.ok).toBeFalse();
    expect(parsed.error).toContain('not found');
  });

  test('an unknown option is a usage error, not a silent default', async () => {
    const { cli } = buildHarness();
    const result = await invoke(cli, ['list', '--refrsh']);

    expect(result.code).toBe(2);
    expect(result.err).toContain('--refrsh');
  });

  test('best names the account with the most left', async () => {
    const { cli } = withAccounts();
    const result = await invoke(cli, ['best', '--json']);

    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.out) as { account: string; remainingPercentage: number };
    expect(parsed.account).toBe('high@example.com');
    expect(parsed.remainingPercentage).toBe(90);
  });

  test('best exits 3 when nothing meets the minimum', async () => {
    // Distinct from a failure: the tool worked, the fleet is just exhausted.
    const { cli } = withAccounts();
    const result = await invoke(cli, ['best', '--min', '95', '--json']);

    expect(result.code).toBe(3);
    expect(JSON.parse(result.out)).toMatchObject({ account: null });
  });

  test('auto switches away from a depleted account', async () => {
    const { cli } = withAccounts();
    process.env.AGYP_ACCOUNT = 'low@example.com';

    const result = await invoke(cli, ['auto', '--json']);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toMatchObject({
      switched: true,
      from: 'low@example.com',
      to: 'high@example.com',
    });
  });

  test('auto leaves a healthy account alone', async () => {
    const { cli } = withAccounts();
    process.env.AGYP_ACCOUNT = 'high@example.com';

    const result = await invoke(cli, ['auto', '--json']);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toMatchObject({ switched: false, to: null });
  });

  test('auto exits 3 when low with nowhere better to go', async () => {
    const { cli, vault, paths, keychain, shadow, probe } = buildHarness();
    vault.registerAccount('only@example.com');
    shadow.ensure('only@example.com', true);
    keychain.writeCredential(paths.shadowKeychain('only@example.com'), 'credential');
    probe.snapshots.set('only@example.com', snapshotFor('only@example.com', 2));
    process.env.AGYP_ACCOUNT = 'only@example.com';

    const result = await invoke(cli, ['auto', '--json']);
    expect(result.code).toBe(3);
    expect(JSON.parse(result.out)).toMatchObject({ switched: false });
  });

  test('AGYP_NO_TUI refuses the menu instead of blocking on a terminal', async () => {
    const { cli } = buildHarness();
    process.env.AGYP_NO_TUI = '1';

    const result = await invoke(cli, []);
    expect(result.code).toBe(2);
    expect(result.err).toContain('agyp auto');
  });

  test('--help prints usage and succeeds', async () => {
    const { cli } = buildHarness();
    const result = await invoke(cli, ['auto', '--help']);

    expect(result.code).toBe(0);
    expect(result.out).toContain('--min');
  });

  test('doctor --json reports stored sign-ins structurally', async () => {
    const { cli, vault, paths, keychain, shadow } = buildHarness();
    vault.registerAccount('person@example.com');
    shadow.ensure('person@example.com', true);
    keychain.writeCredential(paths.shadowKeychain('person@example.com'), 'credential');

    const result = await invoke(cli, ['doctor', '--json']);
    const parsed = JSON.parse(result.out) as {
      accounts: { account: string; hasStoredSignIn: boolean }[];
    };
    expect(parsed.accounts[0]).toMatchObject({
      account: 'person@example.com',
      hasStoredSignIn: true,
    });
  });
});
