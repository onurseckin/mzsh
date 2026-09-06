import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { AgypPaths } from '../../src/domain/agyp/agyp-paths';
import { AgypVault } from '../../src/domain/agyp/agyp-vault';
import { AgypKeychain } from '../../src/infrastructure/agyp/agyp-keychain';
import { AgypShadowHome } from '../../src/infrastructure/agyp/agyp-shadow-home';

const testRoot = join(process.cwd(), '.tmp', `agyp-integration-${Date.now()}`);
const fakeRealHome = join(testRoot, 'home');
const fakeSecurity = join(import.meta.dir, '..', 'fixtures', 'fake-security.sh');

function seedRealHome(): void {
  mkdirSync(join(fakeRealHome, 'Library', 'Keychains'), { recursive: true });
  mkdirSync(join(fakeRealHome, 'Library', 'Caches'), { recursive: true });
  mkdirSync(join(fakeRealHome, 'Library', 'Preferences'), { recursive: true });
  writeFileSync(join(fakeRealHome, 'Library', 'Preferences', 'com.example.app.plist'), 'x');
  writeFileSync(
    join(fakeRealHome, 'Library', 'Preferences', 'com.apple.security.plist'),
    'real-search-list'
  );
  mkdirSync(join(fakeRealHome, '.config'), { recursive: true });
  writeFileSync(join(fakeRealHome, '.gitconfig'), '[user]\n');
  writeFileSync(join(fakeRealHome, 'Library', 'Keychains', 'login.keychain-db'), '');
  writeFileSync(join(fakeRealHome, 'Library', 'Keychains', 'login.keychain-db.items'), '');
  mkdirSync(join(fakeRealHome, '.gemini'), { recursive: true });
}

function build(): { paths: AgypPaths; shadow: AgypShadowHome; keychain: AgypKeychain } {
  const paths = new AgypPaths(fakeRealHome, join(testRoot, 'vault'));
  const keychain = new AgypKeychain(fakeSecurity);
  return { paths, keychain, shadow: new AgypShadowHome(paths, keychain) };
}

describe('agyp shadow home', () => {
  beforeEach(() => {
    mkdirSync(testRoot, { recursive: true });
    seedRealHome();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  test('mirrors the real home as symlinks', () => {
    const { paths, shadow } = build();
    shadow.ensure('person@example.com', true);
    const home = paths.shadowHome('person@example.com');

    for (const entry of ['.gitconfig', '.config', '.gemini']) {
      expect(lstatSync(join(home, entry)).isSymbolicLink()).toBeTrue();
    }
    // Shared history is the point: .gemini must resolve back to the real one.
    expect(readFileSync(join(home, '.gitconfig'), 'utf8')).toBe('[user]\n');
  });

  test('keeps Library/Keychains real while linking the rest of Library', () => {
    const { paths, shadow } = build();
    shadow.ensure('person@example.com', true);
    const library = join(paths.shadowHome('person@example.com'), 'Library');

    expect(lstatSync(join(library, 'Caches')).isSymbolicLink()).toBeTrue();
    expect(lstatSync(join(library, 'Keychains')).isDirectory()).toBeTrue();
    expect(lstatSync(join(library, 'Keychains')).isSymbolicLink()).toBeFalse();
    expect(existsSync(paths.shadowKeychain('person@example.com'))).toBeTrue();
  });

  test('owns its keychain search list instead of writing through to the real home', () => {
    const { paths, shadow } = build();
    shadow.ensure('person@example.com', true);
    const preferences = join(paths.shadowHome('person@example.com'), 'Library', 'Preferences');

    // Real preferences stay shared...
    expect(lstatSync(join(preferences, 'com.example.app.plist')).isSymbolicLink()).toBeTrue();
    // ...but the search list must never be a link back into the real home, or
    // selecting an account would repoint the user's own login keychain.
    expect(existsSync(join(preferences, 'com.apple.security.plist'))).toBeFalse();
    expect(
      readFileSync(join(fakeRealHome, 'Library', 'Preferences', 'com.apple.security.plist'), 'utf8')
    ).toBe('real-search-list');
  });

  test('creates the account keychain under the sandbox home', () => {
    const { paths, shadow } = build();
    shadow.ensure('person@example.com', true);

    // create-keychain appends to the caller's search list, so it has to run
    // with HOME pointed at the sandbox or it edits the user's real one.
    expect(existsSync(paths.shadowKeychain('person@example.com'))).toBeTrue();
    expect(existsSync(join(fakeRealHome, 'Library', 'Preferences', 'search-list'))).toBeFalse();
  });

  test('points the sandbox default keychain at the account keychain', () => {
    const { paths, shadow, keychain } = build();
    const report = shadow.ensure('person@example.com', true);

    // Reads follow the search list, but agy stores without naming a keychain,
    // which targets the default. Both have to point at the account.
    expect(report.defaultKeychainApplied).toBeTrue();
    expect(keychain.readDefaultKeychain(paths.shadowHome('person@example.com'))).toBe(
      paths.shadowKeychain('person@example.com')
    );
  });

  test('never names an account keychain login.keychain-db', () => {
    const { paths, shadow, keychain } = build();
    shadow.ensure('person@example.com', true);
    const keychainPath = paths.shadowKeychain('person@example.com');

    // macOS reserves that name and ignores the creation password, which would
    // make the account keychain unopenable without prompting.
    expect(keychainPath.endsWith('login.keychain-db')).toBeFalse();
    expect(keychain.unlockKeychain(keychainPath)).toBeTrue();
  });

  test('layered mode puts the account keychain ahead of the login keychain', () => {
    const { paths, shadow, keychain } = build();
    shadow.ensure('person@example.com', true);

    const searchList = keychain.readSearchList(paths.shadowHome('person@example.com'));
    expect(searchList[0]).toBe(paths.shadowKeychain('person@example.com'));
    expect(searchList[1]).toBe(paths.realKeychain);
  });

  test('strict mode isolates the account keychain completely', () => {
    const { paths, shadow, keychain } = build();
    shadow.ensure('person@example.com', false);

    const searchList = keychain.readSearchList(paths.shadowHome('person@example.com'));
    expect(searchList).toEqual([paths.shadowKeychain('person@example.com')]);
  });

  test('is idempotent across repeated switches', () => {
    const { paths, shadow } = build();
    const first = shadow.ensure('person@example.com', true);
    const second = shadow.ensure('person@example.com', true);

    expect(first.topLevelLinks).toBeGreaterThan(0);
    expect(second.topLevelLinks).toBe(0);
    expect(existsSync(paths.shadowKeychain('person@example.com'))).toBeTrue();
  });

  test('picks up directories added to the real home after the farm was built', () => {
    const { paths, shadow } = build();
    shadow.ensure('person@example.com', true);
    mkdirSync(join(fakeRealHome, '.newtool'), { recursive: true });

    shadow.ensure('person@example.com', true);
    expect(
      lstatSync(join(paths.shadowHome('person@example.com'), '.newtool')).isSymbolicLink()
    ).toBeTrue();
  });

  test('reports files an agy session wrote inside the sandbox', () => {
    const { paths, shadow } = build();
    shadow.ensure('person@example.com', true);
    writeFileSync(join(paths.shadowHome('person@example.com'), '.strayrc'), 'x');

    expect(shadow.strayEntries('person@example.com')).toEqual(['.strayrc']);
  });
});

describe('agyp credential storage', () => {
  beforeEach(() => {
    mkdirSync(testRoot, { recursive: true });
    seedRealHome();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  test('each account keeps its own credential', () => {
    const { paths, shadow, keychain } = build();
    shadow.ensure('first@example.com', true);
    shadow.ensure('second@example.com', true);

    keychain.writeCredential(paths.shadowKeychain('first@example.com'), 'credential-one');
    keychain.writeCredential(paths.shadowKeychain('second@example.com'), 'credential-two');

    expect(keychain.readCredential(paths.shadowKeychain('first@example.com'))).toBe(
      'credential-one'
    );
    expect(keychain.readCredential(paths.shadowKeychain('second@example.com'))).toBe(
      'credential-two'
    );
  });

  test('switching accounts never rewrites the login keychain', () => {
    const { paths, shadow, keychain } = build();
    keychain.createKeychain(paths.realKeychain, fakeRealHome);
    keychain.writeCredential(paths.realKeychain, 'original-global');

    shadow.ensure('person@example.com', true);
    keychain.writeCredential(paths.shadowKeychain('person@example.com'), 'account-credential');

    expect(keychain.readCredential(paths.realKeychain)).toBe('original-global');
  });

  test('a stored credential is returned byte for byte', () => {
    const { paths, shadow, keychain } = build();
    shadow.ensure('person@example.com', true);
    const blob = 'go-keyring-base64:eyJ0b2tlbiI6e319';

    keychain.writeCredential(paths.shadowKeychain('person@example.com'), blob);
    expect(keychain.readCredential(paths.shadowKeychain('person@example.com'))).toBe(blob);
  });

  test('keeps the account keychain readable only by its owner', () => {
    const { paths, shadow } = build();
    shadow.ensure('person@example.com', true);

    // The file holds a refresh token; security creates it world-readable.
    const mode = statSync(paths.shadowKeychain('person@example.com')).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test('turns off auto-locking when wiring a sandbox', () => {
    const { paths, shadow } = build();
    shadow.ensure('person@example.com', true);

    // macOS creates keychains with lock-on-sleep and a 5 minute idle timeout.
    // Once locked, any read raises a GUI prompt at the user.
    expect(existsSync(`${paths.shadowKeychain('person@example.com')}.nolock`)).toBeTrue();
  });

  test('reads a locked account keychain without prompting', () => {
    const { paths, shadow, keychain } = build();
    shadow.ensure('person@example.com', true);
    const keychainPath = paths.shadowKeychain('person@example.com');
    keychain.writeCredential(keychainPath, 'credential');

    // Simulate the keychain having locked after a reboot or a long idle.
    writeFileSync(`${keychainPath}.locked`, '');
    expect(keychain.readCredential(keychainPath)).toBe('credential');
  });

  test('keeps a recoverable copy of the credential in the login keychain', () => {
    const { paths, shadow, keychain } = build();
    shadow.ensure('person@example.com', true);
    keychain.createKeychain(paths.realKeychain, fakeRealHome);

    expect(keychain.writeMirror(paths.realKeychain, 'person@example.com', 'blob')).toBeTrue();
    expect(keychain.readMirror(paths.realKeychain, 'person@example.com')).toBe('blob');
    // The backup must not collide with the credential agy itself stores.
    keychain.writeCredential(paths.realKeychain, 'agy-own-credential');
    expect(keychain.readMirror(paths.realKeychain, 'person@example.com')).toBe('blob');
    expect(keychain.readCredential(paths.realKeychain)).toBe('agy-own-credential');
  });

  test('replaces a sandbox keychain that can no longer be opened', () => {
    const { paths, shadow } = build();
    shadow.ensure('person@example.com', true);
    const keychainPath = paths.shadowKeychain('person@example.com');

    // Something re-keyed it, so the empty password no longer opens it. Left
    // alone, every read through it would raise a password prompt the user
    // cannot answer.
    writeFileSync(`${keychainPath}.rekeyed`, '');
    const report = shadow.ensure('person@example.com', true);

    expect(report.keychainRebuilt).toBeTrue();
    expect(existsSync(keychainPath)).toBeTrue();
  });

  test('a rebuilt sandbox keychain is owner-only too', () => {
    const { paths, shadow } = build();
    shadow.ensure('person@example.com', true);
    const keychainPath = paths.shadowKeychain('person@example.com');
    writeFileSync(`${keychainPath}.rekeyed`, '');

    // The replacement is created by security at 644; the narrowing must apply
    // to the file that exists after the rebuild, not the one it replaced.
    const report = shadow.ensure('person@example.com', true);
    expect(report.keychainRebuilt).toBeTrue();
    expect(statSync(keychainPath).mode & 0o777).toBe(0o600);
  });

  test('wires a sandbox whose keychain is locked without ever prompting', () => {
    // A keychain is locked after every restart. The first `agyp use` after a
    // reboot used to change its settings before opening it, which made macOS
    // ask for a password. The fixture records any operation that would prompt.
    const { paths, shadow } = build();
    shadow.ensure('person@example.com', true);
    const keychainPath = paths.shadowKeychain('person@example.com');
    writeFileSync(`${keychainPath}.locked`, '');

    const report = shadow.ensure('person@example.com', true);
    expect(report.keychainRebuilt).toBeFalse();
    expect(existsSync(`${keychainPath}.prompted`)).toBeFalse();
    expect(existsSync(`${keychainPath}.locked`)).toBeFalse();
  });

  test('leaves a healthy sandbox keychain alone', () => {
    const { shadow } = build();
    shadow.ensure('person@example.com', true);

    expect(shadow.ensure('person@example.com', true).keychainRebuilt).toBeFalse();
  });

  test('reports a missing credential rather than throwing', () => {
    const { paths, shadow, keychain } = build();
    shadow.ensure('person@example.com', true);

    expect(keychain.hasCredential(paths.shadowKeychain('person@example.com'))).toBeFalse();
    expect(keychain.readCredential(paths.shadowKeychain('person@example.com'))).toBeNull();
  });

  test('unwraps the go-keyring envelope without touching plain payloads', () => {
    const wrapped = `go-keyring-base64:${Buffer.from('{"token":{"expiry":"2026-09-06T08:44:41Z"}}').toString('base64')}`;
    expect(AgypKeychain.readCredentialExpiry(wrapped)).toBe('2026-09-06T08:44:41Z');
    expect(AgypKeychain.decodeCredential('{"token":{}}')).toBe('{"token":{}}');
  });
});

describe('agyp vault and shadow home together', () => {
  beforeEach(() => {
    mkdirSync(testRoot, { recursive: true });
    seedRealHome();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  test('forgetting an account deletes its sandbox', () => {
    const { paths, shadow } = build();
    const vault = new AgypVault(paths);
    vault.registerAccount('person@example.com');
    shadow.ensure('person@example.com', true);

    expect(existsSync(paths.shadowHome('person@example.com'))).toBeTrue();
    vault.removeAccount('person@example.com');
    shadow.remove('person@example.com');

    expect(existsSync(paths.accountDir('person@example.com'))).toBeFalse();
    expect(vault.listAccounts()).toHaveLength(0);
  });
});
