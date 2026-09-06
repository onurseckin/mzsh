import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * On-disk layout of the agyp vault.
 *
 * Each account owns a shadow home: a symlink farm over the real home whose only
 * genuinely private directory is `Library/Keychains`. `agy` resolves both
 * `~/.gemini` and its keychain search list from `$HOME`, so pointing `$HOME` at
 * one of these swaps the Antigravity identity and nothing else.
 */
export class AgypPaths {
  public readonly realHome: string;
  public readonly vaultRoot: string;

  constructor(realHome?: string, vaultRoot?: string) {
    const envHome = process.env.HOME;
    this.realHome =
      realHome ?? (envHome !== undefined && envHome.trim().length > 0 ? envHome : homedir());
    this.vaultRoot = vaultRoot ?? join(this.realHome, '.agyp');
  }

  public canonicalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  public get accountsRoot(): string {
    return join(this.vaultRoot, 'accounts');
  }

  public get registryPath(): string {
    return join(this.vaultRoot, 'registry.json');
  }

  public get quotaCachePath(): string {
    return join(this.vaultRoot, 'quota-cache.json');
  }

  public accountDir(email: string): string {
    return join(this.accountsRoot, this.canonicalizeEmail(email));
  }

  /** The `$HOME` handed to `agy` for this account. */
  public shadowHome(email: string): string {
    return join(this.accountDir(email), 'home');
  }

  public shadowKeychainDir(email: string): string {
    return join(this.shadowHome(email), 'Library', 'Keychains');
  }

  /**
   * Deliberately not named `login.keychain-db`: macOS reserves that name and
   * ignores the password given at creation, which would leave the account
   * keychain impossible to unlock without prompting the user.
   */
  public shadowKeychain(email: string): string {
    return join(this.shadowKeychainDir(email), 'agyp.keychain-db');
  }

  public get realKeychain(): string {
    return join(this.realHome, 'Library', 'Keychains', 'login.keychain-db');
  }

  /**
   * Top-level entries that must never be symlinked into a shadow home:
   * `Library` is rebuilt one level deeper so the keychain can be private, and
   * the vault itself is skipped to keep the farm from nesting into itself.
   */
  public get excludedHomeEntries(): readonly string[] {
    return ['Library', '.agyp'];
  }

  /**
   * `Library` children that stay private to the account.
   *
   * `Preferences` is rebuilt one level deeper rather than linked: `security`
   * records the keychain search list in `com.apple.security.plist`, and a
   * symlinked `Preferences` would send that write straight into the real home,
   * repointing the user's own login keychain.
   */
  public get excludedLibraryEntries(): readonly string[] {
    return ['Keychains', 'Preferences'];
  }

  /** `Library/Preferences` entries that must not be shared with the real home. */
  public get excludedPreferenceEntries(): readonly string[] {
    return ['com.apple.security.plist'];
  }
}
