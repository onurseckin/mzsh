import type { AgypPaths } from '../../domain/agyp/agyp-paths';
import type { AgypVault } from '../../domain/agyp/agyp-vault';
import type { LiveSession, QuotaSnapshot } from '../../domain/agyp/agyp-types';
import type { AgypKeychain } from './agyp-keychain';
import type { AgypQuotaProbe } from './agyp-quota-probe';

export interface QuotaGatherOptions {
  /** Start a throwaway `agy` for accounts with no running session. */
  allowSpawn: boolean;
}

export interface AccountQuota {
  email: string;
  snapshot: QuotaSnapshot | null;
  liveSessions: LiveSession[];
}

/**
 * Resolves quota per account through three tiers, cheapest first:
 *
 *   1. a running `agy` for that account, queried directly
 *   2. a throwaway `agy` started under the account's shadow home
 *   3. the last reading persisted in the vault, flagged as cached
 */
export class AgypQuotaService {
  private readonly paths: AgypPaths;
  private readonly vault: AgypVault;
  private readonly probe: AgypQuotaProbe;
  private readonly keychain: AgypKeychain;

  constructor(paths: AgypPaths, vault: AgypVault, probe: AgypQuotaProbe, keychain: AgypKeychain) {
    this.paths = paths;
    this.vault = vault;
    this.probe = probe;
    this.keychain = keychain;
  }

  public async discoverLiveSessions(): Promise<LiveSession[]> {
    return this.probe.discoverLiveSessions();
  }

  private async resolveOne(
    email: string,
    sessions: readonly LiveSession[],
    options: QuotaGatherOptions
  ): Promise<AccountQuota> {
    const liveSessions = sessions.filter((session) => session.email === email);

    for (const session of liveSessions) {
      const snapshot = await this.probe.readLiveQuota(session.port);
      if (snapshot) {
        this.vault.rememberQuota(snapshot);
        return { email, snapshot, liveSessions };
      }
    }

    if (options.allowSpawn) {
      // The spawned agy reads the sandbox keychain itself. A keychain locked
      // since the last reboot would make it raise a password prompt at the
      // user, so open it first with the password we hold.
      this.keychain.unlockKeychain(this.paths.shadowKeychain(email));
      const snapshot = await this.probe.probeShadowHome(this.paths.shadowHome(email));
      if (snapshot) {
        this.vault.rememberQuota(snapshot);
        return { email, snapshot, liveSessions };
      }
    }

    return { email, snapshot: this.vault.recallQuota(email), liveSessions };
  }

  public async gather(
    emails: readonly string[],
    options: QuotaGatherOptions
  ): Promise<AccountQuota[]> {
    const sessions = await this.discoverLiveSessions();
    // Spawned probes are resolved one at a time: several `agy` boots at once
    // contend for the same loopback discovery window and confuse port diffing.
    const results: AccountQuota[] = [];
    for (const email of emails) {
      results.push(await this.resolveOne(email, sessions, options));
    }
    return results;
  }
}
