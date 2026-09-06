import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildHarness,
  fakeHome,
  invoke,
  snapshotFor,
  testRoot,
  type Harness,
} from './agyp-cli-harness';

const fakeSignIn = join(import.meta.dir, '..', '..', 'fixtures', 'fake-sign-in.sh');

/** An account adopted through a real sign-in, so both copies exist. */
async function adopted(): Promise<Harness> {
  const harness = buildHarness(fakeSignIn);
  harness.keychain.createKeychain(harness.paths.realKeychain, fakeHome);
  harness.probe.watched = snapshotFor('person@example.com', 70);
  await invoke(harness.cli, ['login']);
  return harness;
}

describe('sign-in backup copies', () => {
  beforeEach(() => {
    mkdirSync(join(fakeHome, 'Library', 'Keychains'), { recursive: true });
    mkdirSync(join(testRoot, 'vault'), { recursive: true });
    process.env.FAKE_SECURITY = join(import.meta.dir, '..', '..', 'fixtures', 'fake-security.sh');
    delete process.env.AGYP_ACCOUNT;
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
    delete process.env.FAKE_SECURITY;
  });

  test('adopting a sign-in writes it to the agyp store and the login keychain', async () => {
    const { backups } = await adopted();
    expect(backups.status('person@example.com')).toEqual({ store: true, login: true });
  });

  test('the store is agyp-owned: owner-only and in no sandbox search list', async () => {
    const { paths, keychain } = await adopted();
    // Nothing but agyp addresses it, and only by path, so no host-side
    // keychain event — a re-key, a reset — can ever reach it.
    expect(statSync(paths.backupKeychain).mode & 0o777).toBe(0o600);
    expect(keychain.readSearchList(paths.shadowHome('person@example.com'))).not.toContain(
      paths.backupKeychain
    );
  });

  test('use recovers a wiped sandbox from the store even with the login keychain gone', async () => {
    const harness = await adopted();
    const sandboxKeychain = harness.paths.shadowKeychain('person@example.com');
    // Simulate a host that lost its login keychain and a sandbox that lost
    // its credential: only the agyp store survives.
    harness.keychain.deleteMirror(harness.paths.realKeychain, 'person@example.com');
    rmSync(sandboxKeychain, { force: true });

    const result = await invoke(harness.cli, ['use', 'person']);
    expect(result.code).toBe(0);
    expect(harness.keychain.readCredential(sandboxKeychain)).toBe('fresh-credential');
  });

  test('doctor --repair restores a sandbox whose keychain no longer opens', async () => {
    const harness = await adopted();
    writeFileSync(`${harness.paths.shadowKeychain('person@example.com')}.rekeyed`, '');

    const result = await invoke(harness.cli, ['doctor', '--repair', '--json']);
    const parsed = JSON.parse(result.out) as {
      repairs: { action: string }[];
      needsRepair: boolean;
    };
    expect(parsed.repairs.map((step) => step.action)).toEqual([
      'replaced a sandbox keychain that would not open',
      'restored the sign-in from the agyp store',
    ]);
    expect(parsed.needsRepair).toBeFalse();
  });

  test('doctor --repair completes the store for an account that only had a login copy', async () => {
    const harness = buildHarness();
    harness.keychain.createKeychain(harness.paths.realKeychain, fakeHome);
    harness.vault.registerAccount('older@example.com');
    harness.shadow.ensure('older@example.com', true);
    harness.keychain.writeCredential(harness.paths.shadowKeychain('older@example.com'), 'blob');
    harness.keychain.writeMirror(harness.paths.realKeychain, 'older@example.com', 'blob');

    const result = await invoke(harness.cli, ['doctor', '--repair', '--json']);
    const parsed = JSON.parse(result.out) as { repairs: { action: string }[] };
    expect(parsed.repairs.map((step) => step.action)).toEqual(['added a copy to the agyp store']);
    expect(harness.backups.status('older@example.com')).toEqual({ store: true, login: true });
  });

  test('saving to a store locked since restart never prompts', async () => {
    const harness = await adopted();
    writeFileSync(`${harness.paths.backupKeychain}.locked`, '');

    const saved = harness.backups.save('person@example.com', 'renewed');
    expect(saved.store).toBeTrue();
    expect(existsSync(`${harness.paths.backupKeychain}.prompted`)).toBeFalse();
  });

  test('use after a restart, every keychain locked, never prompts', async () => {
    const harness = await adopted();
    for (const path of [
      harness.paths.shadowKeychain('person@example.com'),
      harness.paths.backupKeychain,
    ]) {
      writeFileSync(`${path}.locked`, '');
    }

    const result = await invoke(harness.cli, ['use', 'person']);
    expect(result.code).toBe(0);
    for (const path of [
      harness.paths.shadowKeychain('person@example.com'),
      harness.paths.backupKeychain,
    ]) {
      expect(existsSync(`${path}.prompted`), path).toBeFalse();
    }
  });

  test('doctor --repair on a whole vault changes nothing and says so', async () => {
    const harness = await adopted();
    const result = await invoke(harness.cli, ['doctor', '--repair']);
    expect(result.out).toContain('nothing needed');
  });

  test('doctor without --repair reports the copies and points at repair when needed', async () => {
    const harness = await adopted();
    harness.keychain.deleteMirror(harness.paths.realKeychain, 'person@example.com');

    const result = await invoke(harness.cli, ['doctor']);
    expect(result.out).toContain('copies    agyp store');
    expect(result.out).toContain('agyp doctor --repair');
  });

  test('doctor --repair says plainly when no copy exists anywhere', async () => {
    const harness = buildHarness();
    harness.vault.registerAccount('lost@example.com');

    const result = await invoke(harness.cli, ['doctor', '--repair', '--json']);
    const parsed = JSON.parse(result.out) as { repairs: { action: string }[] };
    expect(parsed.repairs[0]?.action).toContain('agyp login');
  });

  test('logout removes both copies so a forgotten sign-in does not outlive the account', async () => {
    const harness = await adopted();
    await invoke(harness.cli, ['logout', 'person']);
    expect(harness.backups.status('person@example.com')).toEqual({ store: false, login: false });
  });
});
