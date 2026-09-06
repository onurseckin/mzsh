import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  GO_KEYRING_BASE64_PREFIX,
  KEYCHAIN_ACCOUNT,
  KEYCHAIN_SERVICE,
} from '../../domain/agyp/agyp-types';

const SECURITY_BINARY = '/usr/bin/security';

/** `security` exits 44 when the requested item simply is not in the keychain. */
const ITEM_NOT_FOUND_EXIT_CODE = 44;

interface SecurityRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Thin wrapper over `/usr/bin/security`.
 *
 * `agy` stores its credential through zalando/go-keyring, which shells out to
 * exactly this binary. Going through the same tool means the items we write
 * carry the same ACL as the ones `agy` writes, so neither side triggers an
 * authorisation prompt when reading the other's work.
 */
export class AgypKeychain {
  private readonly securityBinary: string;

  constructor(securityBinary: string = SECURITY_BINARY) {
    this.securityBinary = securityBinary;
  }

  private run(args: readonly string[], home?: string): SecurityRun {
    const environment = home === undefined ? process.env : { ...process.env, HOME: home };
    const result = spawnSync(this.securityBinary, [...args], {
      encoding: 'utf8',
      env: environment,
    });
    return {
      exitCode: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }

  /**
   * Creates an account keychain.
   *
   * `home` is mandatory because `create-keychain` appends the new keychain to
   * the calling user's search list. Run under the real home it would repoint
   * the user's own login keychain; run under the sandbox home the change stays
   * inside the sandbox.
   */
  public createKeychain(keychainPath: string, home: string): boolean {
    const parent = dirname(keychainPath);
    if (!existsSync(parent)) {
      mkdirSync(parent, { recursive: true, mode: 0o700 });
    }
    if (existsSync(keychainPath)) {
      return true;
    }
    // An empty password keeps the account keychain unlockable without a prompt.
    // It is no weaker than the plaintext token file agy falls back to, and the
    // file itself stays inside the owner-only vault.
    return this.run(['create-keychain', '-p', '', keychainPath], home).exitCode === 0;
  }

  /**
   * Stops a keychain from auto-locking.
   *
   * macOS creates keychains with `lock-on-sleep timeout=300s`. Once locked,
   * any read raises a GUI authorisation prompt, which is exactly what an
   * account switcher must never do. Passing no flags clears both the sleep
   * lock and the idle timeout.
   */
  public disableAutoLock(keychainPath: string): boolean {
    return this.run(['set-keychain-settings', keychainPath]).exitCode === 0;
  }

  public unlockKeychain(keychainPath: string): boolean {
    if (!existsSync(keychainPath)) {
      return false;
    }
    // Supplying the password explicitly means this call can never raise a GUI
    // prompt; it either succeeds or reports failure.
    return this.run(['unlock-keychain', '-p', '', keychainPath]).exitCode === 0;
  }

  /**
   * Orders the search list a shadow home sees. Listing the account keychain
   * first and the real login keychain second lets `agy` find its own credential
   * while unrelated consumers (git credential helper, tooling run inside an agy
   * session) still reach the user's real secrets.
   */
  public setSearchList(shadowHome: string, keychainPaths: readonly string[]): boolean {
    const present = keychainPaths.filter((path) => existsSync(path));
    if (present.length === 0) {
      return false;
    }
    return this.run(['list-keychains', '-d', 'user', '-s', ...present], shadowHome).exitCode === 0;
  }

  /**
   * Points the sandbox's default keychain at the account keychain.
   *
   * go-keyring stores without naming a keychain, which targets the default
   * rather than the search list. Without this, a token `agy` refreshes inside
   * a sandbox would miss the account keychain entirely.
   */
  public setDefaultKeychain(shadowHome: string, keychainPath: string): boolean {
    return (
      this.run(['default-keychain', '-d', 'user', '-s', keychainPath], shadowHome).exitCode === 0
    );
  }

  public readDefaultKeychain(shadowHome: string): string | null {
    const result = this.run(['default-keychain', '-d', 'user'], shadowHome);
    if (result.exitCode !== 0) {
      return null;
    }
    const value = result.stdout.trim().replace(/^"|"$/g, '');
    return value.length > 0 ? value : null;
  }

  public readSearchList(shadowHome: string): string[] {
    const result = this.run(['list-keychains', '-d', 'user'], shadowHome);
    if (result.exitCode !== 0) {
      return [];
    }
    return result.stdout
      .split('\n')
      .map((line) => line.trim().replace(/^"|"$/g, ''))
      .filter((line) => line.length > 0);
  }

  /**
   * Returns the stored blob verbatim, including any go-keyring wrapper.
   *
   * Unlocks first: reading a locked keychain would pop an authorisation dialog
   * at the user instead of returning. Supplying the password explicitly means
   * this call can never prompt, and a keychain we do not own (the real login
   * keychain) simply fails the unlock and is read as-is.
   */
  public readCredential(keychainPath?: string): string | null {
    if (keychainPath !== undefined) {
      this.unlockKeychain(keychainPath);
    }
    const args = ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT, '-w'];
    if (keychainPath !== undefined) {
      args.push(keychainPath);
    }
    const result = this.run(args);
    if (result.exitCode === ITEM_NOT_FOUND_EXIT_CODE || result.exitCode !== 0) {
      return null;
    }
    const blob = result.stdout.trim();
    return blob.length > 0 ? blob : null;
  }

  /**
   * Writes the blob verbatim so a credential copied between keychains stays
   * byte-identical to what `agy` wrote.
   *
   * The secret travels as an argv entry, briefly visible to `ps`. That is the
   * same exposure `agy` itself accepts, and avoiding it would mean giving up
   * the shared-ACL property that keeps reads prompt-free.
   */
  public writeCredential(keychainPath: string, blob: string): boolean {
    // Account keychains carry an empty password and unlock silently. The real
    // login keychain does not, and does not need to: macOS unlocks it at
    // login. So this is an opportunistic nudge, never a precondition — the
    // write below is what actually reports success.
    this.unlockKeychain(keychainPath);
    const args = [
      'add-generic-password',
      '-U',
      '-s',
      KEYCHAIN_SERVICE,
      '-a',
      KEYCHAIN_ACCOUNT,
      '-w',
      blob,
      keychainPath,
    ];
    return this.run(args).exitCode === 0;
  }

  public hasCredential(keychainPath: string): boolean {
    return this.readCredential(keychainPath) !== null;
  }

  /** Unwraps go-keyring's base64 envelope; returns the input when unwrapped. */
  public static decodeCredential(blob: string): string {
    if (!blob.startsWith(GO_KEYRING_BASE64_PREFIX)) {
      return blob;
    }
    try {
      return Buffer.from(blob.slice(GO_KEYRING_BASE64_PREFIX.length), 'base64').toString('utf8');
    } catch {
      return blob;
    }
  }

  /**
   * Reports the credential's expiry without exposing the tokens themselves.
   * The stored payload carries no email claim, so account identity has to come
   * from a language-server probe rather than from the credential.
   */
  public static readCredentialExpiry(blob: string): string | null {
    try {
      const parsed = JSON.parse(AgypKeychain.decodeCredential(blob)) as {
        token?: { expiry?: unknown };
      };
      const expiry = parsed.token?.expiry;
      return typeof expiry === 'string' ? expiry : null;
    } catch {
      return null;
    }
  }
}
