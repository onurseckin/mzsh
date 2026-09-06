import type { AgypPaths } from '../../domain/agyp/agyp-paths';
import type { AgypVault } from '../../domain/agyp/agyp-vault';
import { AgypKeychain } from './agyp-keychain';
import type { AgypBackups, BackupStatus } from './agyp-backups';
import type { AgypShadowHome } from './agyp-shadow-home';

export interface AccountHealth {
  email: string;
  keychainPath: string;
  hasCredential: boolean;
  credentialExpiry: string | null;
  backups: BackupStatus;
  sandboxReady: boolean;
  strayEntries: string[];
}

export interface RepairAction {
  email: string;
  action: string;
}

/**
 * Answers "would I have to sign in again?" and, on request, makes the answer
 * no for every account that still has a copy of its sign-in somewhere.
 */
export class AgypRecovery {
  private readonly paths: AgypPaths;
  private readonly vault: AgypVault;
  private readonly keychain: AgypKeychain;
  private readonly shadowHome: AgypShadowHome;
  private readonly backups: AgypBackups;

  constructor(
    paths: AgypPaths,
    vault: AgypVault,
    keychain: AgypKeychain,
    shadowHome: AgypShadowHome,
    backups: AgypBackups
  ) {
    this.paths = paths;
    this.vault = vault;
    this.keychain = keychain;
    this.shadowHome = shadowHome;
    this.backups = backups;
  }

  public inspect(): AccountHealth[] {
    return this.vault.listAccounts().map((account) => {
      const keychainPath = this.paths.shadowKeychain(account.email);
      const blob = this.keychain.readCredential(keychainPath);
      return {
        email: account.email,
        keychainPath,
        hasCredential: blob !== null,
        credentialExpiry: blob === null ? null : AgypKeychain.readCredentialExpiry(blob),
        backups: this.backups.status(account.email),
        sandboxReady: this.shadowHome.exists(account.email),
        strayEntries: this.shadowHome.strayEntries(account.email),
      };
    });
  }

  /** True when a repair would change something. */
  public static needsRepair(health: readonly AccountHealth[]): boolean {
    return health.some(
      (entry) =>
        !entry.sandboxReady || !entry.hasCredential || !entry.backups.store || !entry.backups.login
    );
  }

  /**
   * Puts every registered account back into a usable state from whatever
   * copy survives, and completes the copies that are missing. Safe to run
   * repeatedly: an account already whole produces no action.
   */
  public repair(layered: boolean): RepairAction[] {
    const actions: RepairAction[] = [];
    for (const account of this.vault.listAccounts()) {
      const email = account.email;
      const keychainPath = this.paths.shadowKeychain(email);

      const report = this.shadowHome.ensure(email, layered);
      if (report.keychainRebuilt) {
        actions.push({ email, action: 'replaced a sandbox keychain that would not open' });
      }

      let blob = this.keychain.readCredential(keychainPath);
      if (blob === null) {
        const recovered = this.backups.recover(email);
        if (recovered !== null && this.keychain.writeCredential(keychainPath, recovered.blob)) {
          blob = recovered.blob;
          const from = recovered.source === 'store' ? 'the agyp store' : 'the login keychain';
          actions.push({ email, action: `restored the sign-in from ${from}` });
        } else {
          actions.push({
            email,
            action: 'no copy of the sign-in exists anywhere; run `agyp login`',
          });
          continue;
        }
      }

      const before = this.backups.status(email);
      if (!before.store || !before.login) {
        const after = this.backups.save(email, blob);
        if (after.store && !before.store) {
          actions.push({ email, action: 'added a copy to the agyp store' });
        }
        if (after.login && !before.login) {
          actions.push({ email, action: 'added a copy to the login keychain' });
        }
      }
    }
    return actions;
  }
}
