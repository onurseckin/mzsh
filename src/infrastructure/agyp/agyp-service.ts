import { spawnSync, type StdioOptions } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { AgypVault } from '../../domain/agyp/agyp-vault';
import { AgypTui, AGYP_ACTION_LOGIN } from './agyp-tui';
import type {
  AgypAuthExecutor,
  AgypResult,
  GoogleAccountsPayload,
} from '../../domain/agyp/agyp-types';

export class AgypService {
  private readonly vault: AgypVault;
  private readonly authExecutor?: AgypAuthExecutor;

  constructor(vault?: AgypVault, authExecutor?: AgypAuthExecutor) {
    this.vault = vault ?? new AgypVault();
    this.authExecutor = authExecutor;
  }

  public async pickOrSwitch(targetQuery?: string): Promise<AgypResult> {
    const accounts = this.vault.listAccounts();

    let selectedEmail: string | null = null;

    if (targetQuery) {
      const found = this.vault.findAccount(targetQuery);
      if (!found.account) {
        return {
          success: false,
          message: found.error ?? `Account "${targetQuery}" not found in vault.`,
        };
      }
      selectedEmail = found.account.email;
    } else {
      selectedEmail = await AgypTui.selectAccount(accounts, this.vault.getActiveAccount());
    }

    if (!selectedEmail) {
      return { success: false, message: 'Account selection cancelled.' };
    }

    if (selectedEmail === AGYP_ACTION_LOGIN) {
      return this.loginAccount();
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

  public async loginAccount(
    suggestedEmail?: string,
    customExecutor?: AgypAuthExecutor
  ): Promise<AgypResult> {
    const stagingDir = join(
      this.vault.getVaultRoot(),
      `.staging_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    );
    mkdirSync(stagingDir, { recursive: true, mode: 0o700 });
    const stagingToken = join(stagingDir, 'jetski-standalone-oauth-token');

    let ttyInFd: number | null = null;
    let ttyOutFd: number | null = null;

    try {
      const executor = customExecutor ?? this.authExecutor;
      if (executor) {
        await executor(stagingToken);
      } else {
        console.error(
          '\n\x1b[1;36m🔑 Opening Antigravity login for new account in browser...\x1b[0m\n'
        );

        let childStdio: StdioOptions = 'inherit';
        if (existsSync('/dev/tty')) {
          try {
            if (!process.stdin.isTTY) {
              ttyInFd = openSync('/dev/tty', 'r');
            }
            if (!process.stdout.isTTY) {
              ttyOutFd = openSync('/dev/tty', 'w');
            }
            if (ttyInFd !== null || ttyOutFd !== null) {
              childStdio = [
                ttyInFd !== null ? ttyInFd : 'inherit',
                ttyOutFd !== null ? ttyOutFd : 'inherit',
                'inherit',
              ];
            }
          } catch {
            // Fallback to default inherit
          }
        }

        // Launch agy with isolated token target
        spawnSync('agy', ['--print', 'echo auth_test_success'], {
          stdio: childStdio,
          env: {
            ...process.env,
            JETSKI_STANDALONE_OAUTH_TOKEN_PATH: stagingToken,
          },
        });

        if (!existsSync(stagingToken)) {
          // Try interactive session if print mode did not trigger login
          spawnSync('agy', ['auth', 'login'], {
            stdio: childStdio,
            env: {
              ...process.env,
              JETSKI_STANDALONE_OAUTH_TOKEN_PATH: stagingToken,
            },
          });
        }
      }

      if (!existsSync(stagingToken)) {
        return {
          success: false,
          message: 'Login was not completed or token file was not written.',
        };
      }

      const tokenContent = readFileSync(stagingToken, 'utf8');
      let email = suggestedEmail;

      if (!email) {
        // Inspect global google_accounts.json if updated
        const globalAccounts = join(this.vault.getVaultRoot(), '..', 'google_accounts.json');
        if (existsSync(globalAccounts)) {
          try {
            const raw = readFileSync(globalAccounts, 'utf8');
            const parsed = JSON.parse(raw) as GoogleAccountsPayload;
            email = parsed.active ?? parsed.primaryEmail ?? parsed.accounts?.[0]?.email;
          } catch {
            // ignore
          }
        }
      }

      if (!email) {
        email = `account_${Date.now()}`;
      }

      this.vault.addOrUpdateAccount(email, tokenContent);
      const exportData = this.vault.getEnvironmentExport(email);

      return {
        success: true,
        action: 'export',
        payload: exportData?.exportScript,
        message: `Successfully authenticated and added "${email}" to Antigravity vault.`,
      };
    } finally {
      if (ttyInFd !== null) {
        try {
          closeSync(ttyInFd);
        } catch {
          // ignore
        }
      }
      if (ttyOutFd !== null) {
        try {
          closeSync(ttyOutFd);
        } catch {
          // ignore
        }
      }
      if (existsSync(stagingDir)) {
        rmSync(stagingDir, { recursive: true, force: true });
      }
    }
  }

  public addAccount(email: string, tokenContent: string): AgypResult {
    this.vault.addOrUpdateAccount(email, tokenContent);
    const exportData = this.vault.getEnvironmentExport(email);
    return {
      success: true,
      action: 'export',
      payload: exportData?.exportScript,
    };
  }

  public listAccounts(): AgypResult {
    const accounts = this.vault.listAccounts();
    const active = this.vault.getActiveAccount();

    if (accounts.length === 0) {
      return {
        success: true,
        action: 'print',
        payload: 'No registered accounts found. Run `agyp login` to add an account.',
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

  public removeAccount(emailQuery: string): AgypResult {
    const found = this.vault.findAccount(emailQuery);
    if (!found.account) {
      return {
        success: false,
        message: found.error ?? `Account "${emailQuery}" not found.`,
      };
    }

    const targetEmail = found.account.email;
    const activeBefore = this.vault.getActiveAccount();
    const wasActive = activeBefore === targetEmail;

    const removed = this.vault.removeAccount(targetEmail);
    if (!removed) {
      return { success: false, message: `Account "${targetEmail}" not found.` };
    }

    if (wasActive) {
      const newActive = this.vault.getActiveAccount();
      if (newActive) {
        const exportData = this.vault.getEnvironmentExport(newActive);
        return {
          success: true,
          action: 'export',
          payload: exportData?.exportScript,
          message: `Removed account "${targetEmail}" from vault. Switched active account to "${newActive}".`,
        };
      }
      return {
        success: true,
        action: 'export',
        payload: 'unset AGY_ACCOUNT\nunset JETSKI_STANDALONE_OAUTH_TOKEN_PATH',
        message: `Removed account "${targetEmail}" from vault. No registered accounts remaining.`,
      };
    }

    return {
      success: true,
      action: 'print',
      payload: `Removed account "${targetEmail}" from vault.`,
    };
  }
}
