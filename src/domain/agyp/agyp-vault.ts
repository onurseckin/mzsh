import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

  public canonicalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  public getVaultRoot(): string {
    return this.vaultRoot;
  }

  public getRegistryPath(): string {
    return join(this.vaultRoot, 'registry.json');
  }

  public getAccountDir(email: string): string {
    return join(this.vaultRoot, this.canonicalizeEmail(email));
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
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'accounts' in parsed &&
        Array.isArray((parsed as { accounts: unknown }).accounts)
      ) {
        return parsed as AccountRegistry;
      }
      throw new Error('Invalid registry schema structure');
    } catch {
      try {
        const corruptBackup = `${registryPath}.corrupt.${Date.now()}`;
        copyFileSync(registryPath, corruptBackup);
        chmodSync(corruptBackup, 0o600);
        console.error(
          `[agyp] Warning: registry.json was corrupted. Preserved backup at ${corruptBackup}`
        );
      } catch {
        // Ignore backup error
      }
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
      chmodSync(this.vaultRoot, 0o700);
    }
    const registryPath = this.getRegistryPath();
    const tempPath = `${registryPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    writeFileSync(tempPath, JSON.stringify(registry, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    chmodSync(tempPath, 0o600);
    renameSync(tempPath, registryPath);
    chmodSync(registryPath, 0o600);
  }

  public extractEmailFromJwt(jwtString: string): string | null {
    const parts = jwtString.trim().split('.');
    if (parts.length >= 2 && parts[1]) {
      try {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const jsonStr = Buffer.from(base64, 'base64').toString('utf8');
        const payload = JSON.parse(jsonStr) as Record<string, unknown>;
        if (typeof payload.email === 'string' && payload.email.includes('@')) {
          return payload.email;
        }
        if (typeof payload.sub === 'string' && payload.sub.includes('@')) {
          return payload.sub;
        }
      } catch {
        // Ignore JWT parse error
      }
    }
    return null;
  }

  public extractEmailFromToken(token: string): string | null {
    const trimmed = token.trim();
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof parsed.email === 'string' && parsed.email.includes('@')) {
        return parsed.email;
      }
      if (typeof parsed.id_token === 'string') {
        const email = this.extractEmailFromJwt(parsed.id_token);
        if (email) return email;
      }
      if (typeof parsed.access_token === 'string') {
        const email = this.extractEmailFromJwt(parsed.access_token);
        if (email) return email;
      }
    } catch {
      // Not JSON payload
    }
    return this.extractEmailFromJwt(trimmed);
  }

  public autoImportExistingToken(): boolean {
    const globalToken = join(this.globalGeminiDir, 'jetski-standalone-oauth-token');
    const globalAccounts = join(this.globalGeminiDir, 'google_accounts.json');

    if (!existsSync(globalToken)) {
      return false;
    }

    try {
      const tokenContent = readFileSync(globalToken, 'utf8');
      let email: string | null = null;
      let accountsJson: string | null = null;

      if (existsSync(globalAccounts)) {
        try {
          accountsJson = readFileSync(globalAccounts, 'utf8');
          const parsed = JSON.parse(accountsJson) as unknown as GoogleAccountsPayload;
          const candidate = parsed.active ?? parsed.primaryEmail ?? parsed.accounts?.[0]?.email;
          if (typeof candidate === 'string' && candidate.trim().length > 0) {
            email = candidate.trim();
          }
        } catch {
          // ignore
        }
      }

      if (!email) {
        email = this.extractEmailFromToken(tokenContent);
      }

      if (!email) {
        email = 'default_account';
      }

      const canonicalEmail = this.canonicalizeEmail(email);
      const cleanToken = tokenContent.trim();
      const registry = this.readRegistry();
      const existing = registry.accounts.find((a) => a.email === canonicalEmail);
      const targetTokenPath = this.getTokenPath(canonicalEmail);
      const accountDir = this.getAccountDir(canonicalEmail);

      // Check idempotency: if token on disk matches and already in registry, do not write
      if (existing && existsSync(targetTokenPath)) {
        const currentToken = readFileSync(targetTokenPath, 'utf8').trim();
        if (currentToken === cleanToken) {
          return true;
        }
      }

      if (!existsSync(accountDir)) {
        mkdirSync(accountDir, { recursive: true, mode: 0o700 });
        chmodSync(accountDir, 0o700);
      }

      writeFileSync(targetTokenPath, cleanToken, { mode: 0o600 });
      chmodSync(targetTokenPath, 0o600);
      if (accountsJson) {
        const accPath = join(accountDir, 'google_accounts.json');
        writeFileSync(accPath, accountsJson, { mode: 0o600 });
        chmodSync(accPath, 0o600);
      }

      if (!existing) {
        const now = new Date().toISOString();
        registry.accounts.push({
          email: canonicalEmail,
          addedAt: now,
          lastUsedAt: now,
        });
        if (!registry.activeAccount) {
          registry.activeAccount = canonicalEmail;
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
    const canonicalEmail = this.canonicalizeEmail(email);
    const registry = this.readRegistry();
    const account = registry.accounts.find((a) => a.email === canonicalEmail);
    if (!account) {
      return false;
    }
    account.lastUsedAt = new Date().toISOString();
    registry.activeAccount = canonicalEmail;
    this.writeRegistry(registry);
    return true;
  }

  public addOrUpdateAccount(
    email: string,
    tokenContent: string,
    googleAccountsContent?: string
  ): boolean {
    const canonicalEmail = this.canonicalizeEmail(email);
    const cleanToken = tokenContent.trim();
    const accountDir = this.getAccountDir(canonicalEmail);
    if (!existsSync(accountDir)) {
      mkdirSync(accountDir, { recursive: true, mode: 0o700 });
      chmodSync(accountDir, 0o700);
    }
    const tokenPath = this.getTokenPath(canonicalEmail);
    writeFileSync(tokenPath, cleanToken, { mode: 0o600 });
    chmodSync(tokenPath, 0o600);
    const accountsData =
      googleAccountsContent ?? JSON.stringify({ active: canonicalEmail, old: [] }, null, 2);
    const accPath = join(accountDir, 'google_accounts.json');
    writeFileSync(accPath, accountsData, { mode: 0o600 });
    chmodSync(accPath, 0o600);

    const registry = this.readRegistry();
    const existing = registry.accounts.find((a) => a.email === canonicalEmail);
    const now = new Date().toISOString();
    if (existing) {
      existing.lastUsedAt = now;
    } else {
      registry.accounts.push({
        email: canonicalEmail,
        addedAt: now,
        lastUsedAt: now,
      });
    }
    registry.activeAccount = canonicalEmail;
    this.writeRegistry(registry);
    return true;
  }

  public removeAccount(email: string): boolean {
    const canonicalEmail = this.canonicalizeEmail(email);
    const registry = this.readRegistry();
    const index = registry.accounts.findIndex((a) => a.email === canonicalEmail);
    if (index === -1) {
      return false;
    }
    registry.accounts.splice(index, 1);
    if (registry.activeAccount === canonicalEmail) {
      registry.activeAccount = registry.accounts[0]?.email ?? null;
    }
    this.writeRegistry(registry);

    const accountDir = this.getAccountDir(canonicalEmail);
    if (existsSync(accountDir)) {
      rmSync(accountDir, { recursive: true, force: true });
    }
    return true;
  }

  public getEnvironmentExport(email: string): AgypEnvironmentExport | null {
    this.autoImportExistingToken();
    const canonicalEmail = this.canonicalizeEmail(email);
    const tokenPath = this.getTokenPath(canonicalEmail);
    if (!existsSync(tokenPath)) {
      return null;
    }
    const exportScript = [
      `export AGY_ACCOUNT="${canonicalEmail}"`,
      `export JETSKI_STANDALONE_OAUTH_TOKEN_PATH="${tokenPath}"`,
    ].join('\n');

    return {
      email: canonicalEmail,
      tokenPath,
      exportScript,
    };
  }

  public findAccount(query: string): { account: AccountMetadata | null; error?: string } {
    this.autoImportExistingToken();
    const registry = this.readRegistry();
    const cleanQuery = query.trim().toLowerCase();

    if (!cleanQuery) {
      return { account: null, error: 'Empty account query specified.' };
    }

    // 1. Exact match
    const exact = registry.accounts.find((a) => a.email.toLowerCase() === cleanQuery);
    if (exact) {
      return { account: exact };
    }

    // 2. Prefix match
    const prefixMatches = registry.accounts.filter((a) =>
      a.email.toLowerCase().startsWith(cleanQuery)
    );
    if (prefixMatches.length === 1 && prefixMatches[0]) {
      return { account: prefixMatches[0] };
    }

    // 3. Substring match
    const substringMatches = registry.accounts.filter((a) =>
      a.email.toLowerCase().includes(cleanQuery)
    );
    if (substringMatches.length === 1 && substringMatches[0]) {
      return { account: substringMatches[0] };
    }

    if (prefixMatches.length > 1) {
      const candidates = prefixMatches.map((a) => a.email).join(', ');
      return {
        account: null,
        error: `Ambiguous account query "${query}". Multiple matches found: ${candidates}`,
      };
    }

    if (substringMatches.length > 1) {
      const candidates = substringMatches.map((a) => a.email).join(', ');
      return {
        account: null,
        error: `Ambiguous account query "${query}". Multiple matches found: ${candidates}`,
      };
    }

    return {
      account: null,
      error: `Account "${query}" not found in vault.`,
    };
  }
}
