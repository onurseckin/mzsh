import { AgypPaths } from '../../domain/agyp/agyp-paths';
import { AgypVault } from '../../domain/agyp/agyp-vault';
import { formatResetHint } from '../../domain/agyp/agyp-quota';
import type {
  AgypEnvironmentExport,
  AgypResult,
  AgypScopeState,
} from '../../domain/agyp/agyp-types';
import { AgypKeychain } from './agyp-keychain';
import { AgypShadowHome } from './agyp-shadow-home';
import { AgypQuotaProbe } from './agyp-quota-probe';
import { AgypQuotaService, type AccountQuota } from './agyp-quota-service';
import { AgypProvisioning } from './agyp-provisioning';

const SESSION_ACCOUNT_VARIABLE = 'AGYP_ACCOUNT';

export interface AccountHealth {
  email: string;
  keychainPath: string;
  hasCredential: boolean;
  credentialExpiry: string | null;
  sandboxReady: boolean;
  strayEntries: string[];
}

export interface AgypServiceDependencies {
  paths?: AgypPaths;
  vault?: AgypVault;
  keychain?: AgypKeychain;
  shadowHome?: AgypShadowHome;
  probe?: AgypQuotaProbe;
  quota?: AgypQuotaService;
  provisioning?: AgypProvisioning;
}

export class AgypService {
  public readonly paths: AgypPaths;
  public readonly vault: AgypVault;
  public readonly quota: AgypQuotaService;
  private readonly keychain: AgypKeychain;
  private readonly shadowHome: AgypShadowHome;
  private readonly provisioning: AgypProvisioning;

  constructor(dependencies: AgypServiceDependencies = {}) {
    this.paths = dependencies.paths ?? new AgypPaths();
    this.vault = dependencies.vault ?? new AgypVault(this.paths);
    this.keychain = dependencies.keychain ?? new AgypKeychain();
    this.shadowHome = dependencies.shadowHome ?? new AgypShadowHome(this.paths, this.keychain);
    const probe = dependencies.probe ?? new AgypQuotaProbe();
    this.quota = dependencies.quota ?? new AgypQuotaService(this.paths, this.vault, probe);
    this.provisioning =
      dependencies.provisioning ??
      new AgypProvisioning(this.paths, this.vault, this.keychain, this.shadowHome, probe);
  }

  /**
   * Layered mode keeps the real login keychain in each shadow home's search
   * list so tooling run inside an agy session still reaches unrelated secrets
   * such as the git credential helper. Strict mode isolates completely.
   */
  public get layered(): boolean {
    return process.env.AGYP_KEYCHAIN_MODE !== 'strict';
  }

  public readScope(): AgypScopeState {
    const sessionAccount = process.env[SESSION_ACCOUNT_VARIABLE];
    return {
      sessionAccount:
        sessionAccount !== undefined && sessionAccount.trim().length > 0
          ? sessionAccount.trim().toLowerCase()
          : null,
      globalAccount: this.vault.getGlobalAccount(),
    };
  }

  public buildEnvironmentExport(email: string): AgypEnvironmentExport {
    const canonical = this.vault.canonicalizeEmail(email);
    const shadowHome = this.paths.shadowHome(canonical);
    return {
      email: canonical,
      shadowHome,
      exportScript: [
        `export ${SESSION_ACCOUNT_VARIABLE}="${canonical}"`,
        `export AGYP_HOME="${shadowHome}"`,
        'unset JETSKI_STANDALONE_OAUTH_TOKEN_PATH',
      ].join('\n'),
    };
  }

  private resolveQuery(query: string): { email?: string; error?: string } {
    const found = this.vault.findAccount(query);
    if (!found.account) {
      return { error: found.error ?? `Account "${query}" is not in the vault.` };
    }
    return { email: found.account.email };
  }

  /** Binds an account to the calling shell by emitting shell assignments. */
  public useAccount(query: string): AgypResult {
    const resolved = this.resolveQuery(query);
    if (resolved.email === undefined) {
      return { success: false, message: resolved.error };
    }
    const email = resolved.email;

    this.shadowHome.ensure(email, this.layered);
    const keychainPath = this.paths.shadowKeychain(email);
    if (!this.keychain.hasCredential(keychainPath)) {
      return {
        success: false,
        message: `No stored credential for ${email}. Run \`agyp login\` to sign in again.`,
      };
    }
    this.keychain.unlockKeychain(keychainPath);
    this.vault.touchAccount(email);

    return {
      success: true,
      action: 'export',
      payload: this.buildEnvironmentExport(email).exportScript,
    };
  }

  /**
   * Mirrors an account into the real login keychain so the Antigravity IDE and
   * any `agy` invoked outside the wrapper resolve to it.
   */
  public syncGlobal(query: string): AgypResult {
    const resolved = this.resolveQuery(query);
    if (resolved.email === undefined) {
      return { success: false, message: resolved.error };
    }
    const email = resolved.email;

    const blob = this.keychain.readCredential(this.paths.shadowKeychain(email));
    if (blob === null) {
      return { success: false, message: `No stored credential for ${email}.` };
    }
    if (!this.keychain.writeCredential(this.paths.realKeychain, blob)) {
      return { success: false, message: `Could not write ${email} into the login keychain.` };
    }
    this.vault.setGlobalAccount(email);

    return {
      success: true,
      action: 'print',
      payload: `Global default is now ${email}. The Antigravity IDE picks this up on its next start.`,
    };
  }

  public async login(): Promise<AgypResult> {
    const outcome = await this.provisioning.login(this.layered);
    if (!outcome.success || outcome.email === undefined) {
      return { success: false, message: outcome.message };
    }
    return {
      success: true,
      action: 'export',
      payload: this.buildEnvironmentExport(outcome.email).exportScript,
      message: outcome.message,
    };
  }

  public async importCurrent(): Promise<AgypResult> {
    const outcome = await this.provisioning.importCurrent(this.layered);
    return outcome.success
      ? { success: true, action: 'print', payload: outcome.message }
      : { success: false, message: outcome.message };
  }

  public removeAccount(query: string): AgypResult {
    const resolved = this.resolveQuery(query);
    if (resolved.email === undefined) {
      return { success: false, message: resolved.error };
    }
    const email = resolved.email;
    const wasGlobal = this.vault.getGlobalAccount() === email;

    this.vault.removeAccount(email);
    this.shadowHome.remove(email);

    const replacement = this.vault.getGlobalAccount();
    if (wasGlobal && replacement !== null) {
      this.syncGlobal(replacement);
    }

    const suffix =
      wasGlobal && replacement !== null ? ` Global default moved to ${replacement}.` : '';
    return { success: true, action: 'print', payload: `Removed ${email}.${suffix}` };
  }

  /**
   * Confirms every account's credential is actually on disk and readable.
   *
   * The sandbox keychain is the only copy of a sign-in, so this is the check
   * that answers "would I have to log in again?" without having to try it.
   */
  public inspectAccounts(): AccountHealth[] {
    return this.vault.listAccounts().map((account) => {
      const keychainPath = this.paths.shadowKeychain(account.email);
      const blob = this.keychain.readCredential(keychainPath);
      return {
        email: account.email,
        keychainPath,
        hasCredential: blob !== null,
        credentialExpiry: blob === null ? null : AgypKeychain.readCredentialExpiry(blob),
        sandboxReady: this.shadowHome.exists(account.email),
        strayEntries: this.shadowHome.strayEntries(account.email),
      };
    });
  }

  public async gatherQuota(allowSpawn: boolean): Promise<AccountQuota[]> {
    const emails = this.vault.listAccounts().map((account) => account.email);
    return this.quota.gather(emails, { allowSpawn });
  }

  /** One-line quota digest used by the list view and the status header. */
  public static describeQuota(entry: AccountQuota): string {
    if (!entry.snapshot) {
      return 'quota unknown';
    }
    const parts = entry.snapshot.pools.map((pool) => {
      const hint = formatResetHint(pool.resetTime);
      const suffix = hint.length > 0 ? ` (${hint})` : '';
      return `${pool.label} ${pool.remainingPercentage}%${suffix}`;
    });
    const staleness = entry.snapshot.source === 'cache' ? ' [cached]' : '';
    return `${parts.join('  ')}${staleness}`;
  }
}
