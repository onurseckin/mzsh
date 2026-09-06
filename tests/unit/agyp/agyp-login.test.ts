import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { PENDING_MIRROR_ACCOUNT } from '../../../src/domain/agyp/agyp-types';
import {
  buildHarness,
  fakeHome,
  fakeSecurity,
  invoke,
  snapshotFor,
  testRoot,
} from './agyp-cli-harness';

const fakeSignIn = join(import.meta.dir, '..', '..', 'fixtures', 'fake-sign-in.sh');

describe('agyp login keeps every sign-in', () => {
  beforeEach(() => {
    mkdirSync(join(fakeHome, 'Library', 'Keychains'), { recursive: true });
    mkdirSync(join(testRoot, 'vault'), { recursive: true });
    process.env.FAKE_SECURITY = fakeSecurity;
    delete process.env.AGYP_ACCOUNT;
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
    delete process.env.FAKE_SECURITY;
    delete process.env.FAKE_SIGN_IN_BLOB;
  });

  test('takes the identity from the sign-in session itself', async () => {
    const harness = buildHarness(fakeSignIn);
    harness.keychain.createKeychain(harness.paths.realKeychain, fakeHome);
    harness.probe.watched = snapshotFor('watched@example.com', 70);

    const result = await invoke(harness.cli, ['login']);
    expect(result.code).toBe(0);
    expect(harness.vault.listAccounts().map((a) => a.email)).toEqual(['watched@example.com']);
    expect(
      harness.keychain.readCredential(harness.paths.shadowKeychain('watched@example.com'))
    ).toBe('fresh-credential');
  });

  test('falls back to the email the caller supplied', async () => {
    const harness = buildHarness(fakeSignIn);
    harness.keychain.createKeychain(harness.paths.realKeychain, fakeHome);

    const result = await invoke(harness.cli, ['login', 'Given@Example.com']);
    expect(result.code).toBe(0);
    expect(harness.vault.listAccounts().map((a) => a.email)).toEqual(['given@example.com']);
  });

  test('keeps an unidentifiable sign-in instead of discarding it', async () => {
    // Reproduces the failure that lost a real sign-in: the session could not
    // be identified and the staging home was thrown away with the credential.
    const harness = buildHarness(fakeSignIn);
    harness.keychain.createKeychain(harness.paths.realKeychain, fakeHome);

    const result = await invoke(harness.cli, ['login']);
    expect(result.code).toBe(1);
    expect(result.err).toContain('agyp claim');
    expect(harness.keychain.readMirror(harness.paths.realKeychain, PENDING_MIRROR_ACCOUNT)).toBe(
      'fresh-credential'
    );
    expect(harness.vault.listAccounts()).toHaveLength(0);
  });

  test('claim attaches the kept sign-in and verifies who it belongs to', async () => {
    const harness = buildHarness(fakeSignIn);
    harness.keychain.createKeychain(harness.paths.realKeychain, fakeHome);
    await invoke(harness.cli, ['login']);
    harness.probe.snapshots.set('person@example.com', snapshotFor('person@example.com', 60));

    const result = await invoke(harness.cli, ['claim', 'person@example.com']);
    expect(result.code).toBe(0);
    expect(harness.vault.listAccounts().map((a) => a.email)).toEqual(['person@example.com']);
    expect(
      harness.keychain.readCredential(harness.paths.shadowKeychain('person@example.com'))
    ).toBe('fresh-credential');
    expect(
      harness.keychain.readMirror(harness.paths.realKeychain, PENDING_MIRROR_ACCOUNT)
    ).toBeNull();
  });

  test('claim refiles under the real account when the name given is wrong', async () => {
    const harness = buildHarness(fakeSignIn);
    harness.keychain.createKeychain(harness.paths.realKeychain, fakeHome);
    await invoke(harness.cli, ['login']);
    // The probe identifies whichever sandbox it is pointed at as this account.
    harness.probe.snapshots.set('wrong@example.com', snapshotFor('actual@example.com', 60));

    const result = await invoke(harness.cli, ['claim', 'wrong@example.com']);
    expect(result.code).toBe(0);
    expect(result.err).toContain('filed under actual@example.com');
    expect(harness.vault.listAccounts().map((a) => a.email)).toEqual(['actual@example.com']);
  });

  test('a sign-in that never stored a credential loses nothing and says so', async () => {
    const harness = buildHarness('/usr/bin/true');
    const result = await invoke(harness.cli, ['login']);

    expect(result.code).toBe(1);
    expect(result.err).toContain('did not complete');
  });
});
