import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AgypPaths } from '../../domain/agyp/agyp-paths';
import type { AgypKeychain } from './agyp-keychain';

export type BackupSource = 'store' | 'login';

export interface BackupStatus {
  store: boolean;
  login: boolean;
}

/**
 * Keeps two copies of every sign-in outside the sandboxes.
 *
 * The store is agyp's own keychain under the vault. It sits in no search
 * list, is nobody's default and is only ever addressed by path, so nothing
 * that goes wrong with the host's keychains — a re-key, a "Reset to
 * Defaults", a wiped login keychain — can reach it. The login keychain holds
 * a second copy because macOS keeps it unlocked and it survives a lost vault.
 */
export class AgypBackups {
  private readonly paths: AgypPaths;
  private readonly keychain: AgypKeychain;

  constructor(paths: AgypPaths, keychain: AgypKeychain) {
    this.paths = paths;
    this.keychain = keychain;
  }

  /** Creates the store on first use and re-applies its hardening every time. */
  public ensureStore(): boolean {
    const path = this.paths.backupKeychain;
    // create-keychain appends to the caller's search list; run it under a
    // scratch home so that side effect lands somewhere disposable.
    mkdirSync(join(this.paths.backupHome, 'Library', 'Preferences'), {
      recursive: true,
      mode: 0o700,
    });
    const created = this.keychain.createKeychain(path, this.paths.backupHome);
    // Open before touching settings: on a locked keychain that call prompts.
    this.keychain.unlockKeychain(path);
    this.keychain.disableAutoLock(path);
    try {
      chmodSync(path, 0o600);
    } catch {
      // Reported through `created`.
    }
    return created;
  }

  private openStore(): boolean {
    if (!existsSync(this.paths.backupKeychain)) {
      return false;
    }
    // Locked since the last restart is the normal case; opening with the
    // password we hold is what keeps this from ever prompting.
    return this.keychain.unlockKeychain(this.paths.backupKeychain);
  }

  public save(email: string, blob: string): BackupStatus {
    this.ensureStore();
    return {
      store: this.keychain.writeMirror(this.paths.backupKeychain, email, blob),
      login: this.keychain.writeMirror(this.paths.realKeychain, email, blob),
    };
  }

  /** The store is preferred: it is the copy no host-side event can touch. */
  public recover(email: string): { blob: string; source: BackupSource } | null {
    if (this.openStore()) {
      const fromStore = this.keychain.readMirror(this.paths.backupKeychain, email);
      if (fromStore !== null) {
        return { blob: fromStore, source: 'store' };
      }
    }
    const fromLogin = this.keychain.readMirror(this.paths.realKeychain, email);
    return fromLogin === null ? null : { blob: fromLogin, source: 'login' };
  }

  public status(email: string): BackupStatus {
    const store = this.openStore()
      ? this.keychain.readMirror(this.paths.backupKeychain, email) !== null
      : false;
    return {
      store,
      login: this.keychain.readMirror(this.paths.realKeychain, email) !== null,
    };
  }

  public forget(email: string): void {
    if (this.openStore()) {
      this.keychain.deleteMirror(this.paths.backupKeychain, email);
    }
    this.keychain.deleteMirror(this.paths.realKeychain, email);
  }
}
