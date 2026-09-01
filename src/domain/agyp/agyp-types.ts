/**
 * Antigravity Multi-Account Vault Types & Schemas
 */

export interface AccountMetadata {
  email: string;
  addedAt: string;
  lastUsedAt: string;
}

export interface AccountRegistry {
  version: 1;
  activeAccount: string | null;
  accounts: AccountMetadata[];
}

export interface GoogleAccountProfile {
  email?: string;
  name?: string;
  picture?: string;
}

export interface GoogleAccountsPayload {
  active?: string;
  primaryEmail?: string;
  accounts?: GoogleAccountProfile[];
  old?: string[];
}

export interface AgypEnvironmentExport {
  email: string;
  tokenPath: string;
  exportScript: string;
}

export interface AgypResult {
  success: boolean;
  message?: string;
  action?: 'export' | 'print' | 'none';
  payload?: string;
}
