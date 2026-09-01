import { existsSync, mkdirSync } from 'node:fs';
import { AgypVault } from '../../domain/agyp/agyp-vault';
import { AgypTui } from './agyp-tui';
import type { AgypResult } from '../../domain/agyp/agyp-types';

export class AgypService {
  private readonly vault: AgypVault;

  constructor(vault?: AgypVault) {
    this.vault = vault ?? new AgypVault();
  }

  public async pickOrSwitch(targetEmail?: string): Promise<AgypResult> {
    const accounts = this.vault.listAccounts();

    if (accounts.length === 0) {
      return {
        success: false,
        message:
          'No Antigravity accounts found in vault. Please run `agyp login` or ensure ~/.gemini is authenticated.',
      };
    }

    let selectedEmail: string | null = targetEmail ?? null;

    if (!selectedEmail) {
      if (accounts.length === 1 && accounts[0]) {
        selectedEmail = accounts[0].email;
      } else {
        selectedEmail = await AgypTui.selectAccount(accounts, this.vault.getActiveAccount());
      }
    }

    if (!selectedEmail) {
      return { success: false, message: 'Account selection cancelled.' };
    }

    const exportData = this.vault.getEnvironmentExport(selectedEmail);
    if (!exportData) {
      return {
        success: false,
        message: `Account "${selectedEmail}" not found in vault.`,
      };
    }

    this.vault.setActiveAccount(selectedEmail);

    return {
      success: true,
      action: 'export',
      payload: exportData.exportScript,
    };
  }

  public listAccounts(): AgypResult {
    const accounts = this.vault.listAccounts();
    const active = this.vault.getActiveAccount();

    if (accounts.length === 0) {
      return {
        success: true,
        action: 'print',
        payload: 'No registered accounts found.',
      };
    }

    const lines = accounts.map((acc) => {
      const marker = acc.email === active ? '* ' : '  ';
      const suffix = acc.email === active ? ' (active)' : '';
      return `${marker}${acc.email}${suffix}`;
    });

    return {
      success: true,
      action: 'print',
      payload: lines.join('\n'),
    };
  }

  public currentAccount(): AgypResult {
    const active = this.vault.getActiveAccount();
    if (!active) {
      return { success: false, message: 'No active account set.' };
    }
    return {
      success: true,
      action: 'print',
      payload: active,
    };
  }

  public removeAccount(email: string): AgypResult {
    const removed = this.vault.removeAccount(email);
    if (!removed) {
      return { success: false, message: `Account "${email}" not found.` };
    }
    return {
      success: true,
      action: 'print',
      payload: `Removed account "${email}" from vault.`,
    };
  }

  public stageLogin(email?: string): AgypResult {
    const targetEmail = email ?? `account_${Date.now()}`;
    const targetDir = this.vault.getAccountDir(targetEmail);
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true, mode: 0o700 });
    }
    return {
      success: true,
      action: 'print',
      payload: `Staged account login target at ${targetDir}.`,
    };
  }
}
