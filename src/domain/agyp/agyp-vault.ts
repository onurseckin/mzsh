import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import type { AgypPaths } from './agyp-paths';
import { matchAccount } from './agyp-matcher';
import type { AccountMetadata, AccountRegistry, QuotaCache, QuotaSnapshot } from './agyp-types';

function emptyRegistry(): AccountRegistry {
  return { version: 2, globalAccount: null, accounts: [] };
}

function isAccountArray(value: unknown): value is AccountMetadata[] {
  return Array.isArray(value);
}

/**
 * Owner-only JSON store for the account roster and the last quota reading.
 *
 * No credential material lives here — tokens stay in each account's keychain.
 */
export class AgypVault {
  private readonly paths: AgypPaths;

  constructor(paths: AgypPaths) {
    this.paths = paths;
  }

  private ensureVaultRoot(): void {
    if (!existsSync(this.paths.vaultRoot)) {
      mkdirSync(this.paths.vaultRoot, { recursive: true, mode: 0o700 });
      chmodSync(this.paths.vaultRoot, 0o700);
    }
  }

  private writeJson(filePath: string, payload: unknown): void {
    this.ensureVaultRoot();
    const suffix = `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    const temporaryPath = `${filePath}.tmp.${suffix}`;
    writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, filePath);
    chmodSync(filePath, 0o600);
  }

  private readJson(filePath: string): unknown {
    if (!existsSync(filePath)) {
      return null;
    }
    try {
      return JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
    } catch {
      try {
        const backup = `${filePath}.corrupt.${Date.now()}`;
        copyFileSync(filePath, backup);
        chmodSync(backup, 0o600);
        console.error(`[agyp] ${filePath} was unreadable. Preserved a copy at ${backup}`);
      } catch {
        // Nothing further to salvage.
      }
      return null;
    }
  }

  public canonicalizeEmail(email: string): string {
    return this.paths.canonicalizeEmail(email);
  }

  public readRegistry(): AccountRegistry {
    const parsed = this.readJson(this.paths.registryPath);
    const record =
      typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
    if (!record || !isAccountArray(record.accounts)) {
      return emptyRegistry();
    }

    return {
      version: 2,
      globalAccount: typeof record.globalAccount === 'string' ? record.globalAccount : null,
      accounts: record.accounts,
    };
  }

  public writeRegistry(registry: AccountRegistry): void {
    this.writeJson(this.paths.registryPath, registry);
  }

  public listAccounts(): AccountMetadata[] {
    return this.readRegistry().accounts;
  }

  public registerAccount(email: string): AccountMetadata {
    const canonical = this.canonicalizeEmail(email);
    const registry = this.readRegistry();
    const now = new Date().toISOString();
    const existing = registry.accounts.find((account) => account.email === canonical);

    if (existing) {
      existing.lastUsedAt = now;
      this.writeRegistry(registry);
      return existing;
    }

    const created: AccountMetadata = { email: canonical, addedAt: now, lastUsedAt: now };
    registry.accounts.push(created);
    if (registry.globalAccount === null) {
      registry.globalAccount = canonical;
    }
    this.writeRegistry(registry);
    return created;
  }

  public touchAccount(email: string): void {
    const canonical = this.canonicalizeEmail(email);
    const registry = this.readRegistry();
    const account = registry.accounts.find((entry) => entry.email === canonical);
    if (account) {
      account.lastUsedAt = new Date().toISOString();
      this.writeRegistry(registry);
    }
  }

  public removeAccount(email: string): boolean {
    const canonical = this.canonicalizeEmail(email);
    const registry = this.readRegistry();
    const index = registry.accounts.findIndex((account) => account.email === canonical);
    if (index === -1) {
      return false;
    }
    registry.accounts.splice(index, 1);
    if (registry.globalAccount === canonical) {
      registry.globalAccount = registry.accounts[0]?.email ?? null;
    }
    this.writeRegistry(registry);
    this.clearQuota(canonical);
    return true;
  }

  public getGlobalAccount(): string | null {
    return this.readRegistry().globalAccount;
  }

  public setGlobalAccount(email: string | null): void {
    const registry = this.readRegistry();
    registry.globalAccount = email === null ? null : this.canonicalizeEmail(email);
    this.writeRegistry(registry);
  }

  public findAccount(query: string): { account: AccountMetadata | null; error?: string } {
    return matchAccount(this.listAccounts(), query);
  }

  public readQuotaCache(): QuotaCache {
    const parsed = this.readJson(this.paths.quotaCachePath);
    const record =
      typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
    const snapshots = record?.snapshots;
    if (typeof snapshots !== 'object' || snapshots === null) {
      return { version: 1, snapshots: {} };
    }
    return { version: 1, snapshots: snapshots as Record<string, QuotaSnapshot> };
  }

  public rememberQuota(snapshot: QuotaSnapshot): void {
    const cache = this.readQuotaCache();
    cache.snapshots[snapshot.email] = snapshot;
    this.writeJson(this.paths.quotaCachePath, cache);
  }

  public recallQuota(email: string): QuotaSnapshot | null {
    const cached = this.readQuotaCache().snapshots[this.canonicalizeEmail(email)];
    return cached ? { ...cached, source: 'cache' } : null;
  }

  public clearQuota(email: string): void {
    const cache = this.readQuotaCache();
    if (delete cache.snapshots[this.canonicalizeEmail(email)]) {
      this.writeJson(this.paths.quotaCachePath, cache);
    }
  }
}
