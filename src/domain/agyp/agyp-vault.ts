import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  AccountMetadata,
  AccountRegistry,
  AgypEnvironmentExport,
  GoogleAccountsPayload,
} from './agyp-types';

export class AgypVault {
  private readonly vaultRoot: string;
  private readonly globalGeminiDir: string;

  constructor(customVaultDir?: string, customGeminiDir?: string) {
    this.globalGeminiDir = customGeminiDir ?? join(homedir(), '.gemini');
    this.vaultRoot = customVaultDir ?? join(this.globalGeminiDir, 'accounts');
  }

  public getVaultRoot(): string {
    return this.vaultRoot;
  }

  public getRegistryPath(): string {
    return join(this.vaultRoot, 'registry.json');
  }

  public getAccountDir(email: string): string {
    return join(this.vaultRoot, email);
  }

  public getTokenPath(email: string): string {
    return join(this.getAccountDir(email), 'jetski-standalone-oauth-token');
  }

  public readRegistry(): AccountRegistry {
    const registryPath = this.getRegistryPath();
    if (!existsSync(registryPath)) {
      return {
        version: 1,
        activeAccount: null,
        accounts: [],
      };
    }
    try {
      const raw = readFileSync(registryPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === 'object' && parsed !== null && 'accounts' in parsed) {
        return parsed as AccountRegistry;
      }
    } catch {
      // Return empty default on parse error
    }
    return {
      version: 1,
      activeAccount: null,
      accounts: [],
    };
  }

  public writeRegistry(registry: AccountRegistry): void {
    if (!existsSync(this.vaultRoot)) {
      mkdirSync(this.vaultRoot, { recursive: true, mode: 0o700 });
    }
    const registryPath = this.getRegistryPath();
    writeFileSync(registryPath, JSON.stringify(registry, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
  }

  public autoImportExistingToken(): boolean {
    const globalToken = join(this.globalGeminiDir, 'jetski-standalone-oauth-token');
    const globalAccounts = join(this.globalGeminiDir, 'google_accounts.json');

    if (!existsSync(globalToken) || !existsSync(globalAccounts)) {
      return false;
    }

    try {
      const accountsJson = readFileSync(globalAccounts, 'utf8');
      const parsed = JSON.parse(accountsJson) as unknown as GoogleAccountsPayload;
      const email = parsed.primaryEmail ?? parsed.accounts?.[0]?.email;
      if (!email || typeof email !== 'string') {
        return false;
      }

      const registry = this.readRegistry();
      const existing = registry.accounts.find((a) => a.email === email);
      const accountDir = this.getAccountDir(email);

      if (!existsSync(accountDir)) {
        mkdirSync(accountDir, { recursive: true, mode: 0o700 });
      }

      const tokenContent = readFileSync(globalToken, 'utf8');
      writeFileSync(this.getTokenPath(email), tokenContent, { mode: 0o600 });
      writeFileSync(join(accountDir, 'google_accounts.json'), accountsJson, { mode: 0o600 });

      if (!existing) {
        const now = new Date().toISOString();
        registry.accounts.push({
          email,
          addedAt: now,
          lastUsedAt: now,
        });
        if (!registry.activeAccount) {
          registry.activeAccount = email;
        }
        this.writeRegistry(registry);
      }
      return true;
    } catch {
      return false;
    }
  }

  public listAccounts(): AccountMetadata[] {
    this.autoImportExistingToken();
    const registry = this.readRegistry();
    return registry.accounts;
  }

  public getActiveAccount(): string | null {
    this.autoImportExistingToken();
    const registry = this.readRegistry();
    return registry.activeAccount;
  }

  public setActiveAccount(email: string): boolean {
    this.autoImportExistingToken();
    const registry = this.readRegistry();
    const account = registry.accounts.find((a) => a.email === email);
    if (!account) {
      return false;
    }
    account.lastUsedAt = new Date().toISOString();
    registry.activeAccount = email;
    this.writeRegistry(registry);
    return true;
  }

  public removeAccount(email: string): boolean {
    const registry = this.readRegistry();
    const index = registry.accounts.findIndex((a) => a.email === email);
    if (index === -1) {
      return false;
    }
    registry.accounts.splice(index, 1);
    if (registry.activeAccount === email) {
      registry.activeAccount = registry.accounts[0]?.email ?? null;
    }
    this.writeRegistry(registry);

    const accountDir = this.getAccountDir(email);
    if (existsSync(accountDir)) {
      rmSync(accountDir, { recursive: true, force: true });
    }
    return true;
  }

  public getEnvironmentExport(email: string): AgypEnvironmentExport | null {
    this.autoImportExistingToken();
    const tokenPath = this.getTokenPath(email);
    if (!existsSync(tokenPath)) {
      return null;
    }
    const exportScript = [
      `export AGY_ACCOUNT="${email}"`,
      `export JETSKI_STANDALONE_OAUTH_TOKEN_PATH="${tokenPath}"`,
    ].join('\n');

    return {
      email,
      tokenPath,
      exportScript,
    };
  }
}
