import type { AgypResult } from '../domain/agyp/agyp-types';
import { AgypService } from '../infrastructure/agyp/agyp-service';
import { AgypInteractive } from './agyp-interactive';

const HELP_TEXT = `
agyp - Antigravity account manager

Usage:
  agyp                       Account menu with live quota
  agyp <prefix|email>        Use a matching account in this shell
  agyp use <prefix|email>    Same, explicit
  agyp global <prefix|email> Mirror an account into the login keychain (IDE + unwrapped agy)
  agyp sync                  Re-push the current global account into the login keychain
  agyp list                  Accounts with quota
  agyp quota [prefix|email]  Quota report, probing accounts with no live session
  agyp current               Show the account bound to this shell and the global default
  agyp login                 Sign in to an additional account
  agyp import                Adopt whatever account the login keychain currently holds
  agyp logout <prefix|email> Forget an account and delete its sandbox
  agyp doctor                Diagnose the vault
  agyp help                  This message

Scopes:
  This shell   AGYP_ACCOUNT / AGYP_HOME; the agy wrapper points HOME at the account sandbox.
  Global       The real login keychain, used by the Antigravity IDE and any bare agy.

Set AGYP_KEYCHAIN_MODE=strict to keep account sandboxes from falling back to the
login keychain for unrelated secrets.
`;

export class AgypCli {
  private readonly service: AgypService;

  constructor(service?: AgypService) {
    this.service = service ?? new AgypService();
  }

  public async run(argv: readonly string[]): Promise<number> {
    const command = argv[0]?.toLowerCase();

    if (command === undefined || command === 'pick' || command === 'menu') {
      return this.emit(await new AgypInteractive(this.service).run());
    }

    switch (command) {
      case 'use':
      case 'switch':
        return this.requireQuery(argv[1], 'agyp use <prefix|email>', (query) =>
          this.service.useAccount(query)
        );
      case 'global':
        return this.requireQuery(argv[1], 'agyp global <prefix|email>', (query) =>
          this.service.syncGlobal(query)
        );
      case 'sync':
        return this.emit(this.syncCurrentGlobal(argv[1]));
      case 'list':
      case 'ls':
        return this.emit(await this.listAccounts());
      case 'quota':
        return this.emit(await this.quotaReport(argv[1]));
      case 'current':
      case 'whoami':
        return this.emit(this.currentScope());
      case 'login':
        return this.emit(await this.service.login());
      case 'import':
        return this.emit(await this.service.importCurrent());
      case 'logout':
      case 'rm':
      case 'remove':
        return this.requireQuery(argv[1], 'agyp logout <prefix|email>', (query) =>
          this.service.removeAccount(query)
        );
      case 'doctor':
        return this.emit(await this.doctor());
      case 'help':
      case '--help':
      case '-h':
        console.log(HELP_TEXT.trim());
        return 0;
      default:
        return this.emit(this.service.useAccount(command));
    }
  }

  private requireQuery(
    query: string | undefined,
    usage: string,
    action: (query: string) => AgypResult
  ): number {
    if (query === undefined || query.trim().length === 0) {
      console.error(`Usage: ${usage}`);
      return 1;
    }
    return this.emit(action(query));
  }

  private syncCurrentGlobal(query: string | undefined): AgypResult {
    if (query !== undefined && query.trim().length > 0) {
      return this.service.syncGlobal(query);
    }
    const scope = this.service.readScope();
    const target = scope.sessionAccount ?? scope.globalAccount;
    if (target === null) {
      return { success: false, message: 'No account selected to sync.' };
    }
    return this.service.syncGlobal(target);
  }

  private currentScope(): AgypResult {
    const scope = this.service.readScope();
    const session = scope.sessionAccount ?? '(unset — this shell follows the global default)';
    const global = scope.globalAccount ?? '(none)';
    return {
      success: true,
      action: 'print',
      payload: [`this shell  ${session}`, `global      ${global}`].join('\n'),
    };
  }

  private async listAccounts(): Promise<AgypResult> {
    const scope = this.service.readScope();
    const quotas = await this.service.gatherQuota(false);
    if (quotas.length === 0) {
      return { success: true, action: 'print', payload: 'No accounts yet. Run `agyp login`.' };
    }
    const lines = quotas.map((entry) => {
      const badges = [
        entry.email === scope.sessionAccount ? 'S' : ' ',
        entry.email === scope.globalAccount ? 'G' : ' ',
      ].join('');
      const live = entry.liveSessions.length > 0 ? `${entry.liveSessions.length} running` : '';
      const quota = AgypService.describeQuota(entry).padEnd(24);
      return `${badges} ${entry.email.padEnd(32)} ${quota} ${live}`.trimEnd();
    });
    return { success: true, action: 'print', payload: lines.join('\n') };
  }

  private async quotaReport(query: string | undefined): Promise<AgypResult> {
    if (query !== undefined && query.trim().length > 0) {
      const found = this.service.vault.findAccount(query);
      if (!found.account) {
        return { success: false, message: found.error };
      }
      const [entry] = await this.service.quota.gather([found.account.email], { allowSpawn: true });
      if (!entry) {
        return { success: false, message: `No quota reading for ${found.account.email}.` };
      }
      return {
        success: true,
        action: 'print',
        payload: `${entry.email}  ${AgypService.describeQuota(entry)}`,
      };
    }

    const quotas = await this.service.gatherQuota(true);
    if (quotas.length === 0) {
      return { success: true, action: 'print', payload: 'No accounts yet. Run `agyp login`.' };
    }
    return {
      success: true,
      action: 'print',
      payload: quotas
        .map((entry) => `${entry.email.padEnd(32)} ${AgypService.describeQuota(entry)}`)
        .join('\n'),
    };
  }

  private async doctor(): Promise<AgypResult> {
    const scope = this.service.readScope();
    const accounts = this.service.vault.listAccounts();
    const sessions = await this.service.quota.discoverLiveSessions();

    const lines = [
      `vault             ${this.service.paths.vaultRoot}`,
      `keychain mode     ${this.service.layered ? 'layered (falls back to login keychain)' : 'strict'}`,
      `this shell        ${scope.sessionAccount ?? '(unset)'}`,
      `global default    ${scope.globalAccount ?? '(none)'}`,
      `accounts          ${accounts.length}`,
      `running agy       ${sessions.length}`,
    ];
    for (const session of sessions) {
      lines.push(`  pid ${session.pid} port ${session.port}  ${session.email}`);
    }

    lines.push('', 'stored sign-ins');
    const health = this.service.inspectAccounts();
    if (health.length === 0) {
      lines.push('  none yet — run `agyp login`');
    }
    for (const entry of health) {
      const state = entry.hasCredential ? 'stored' : 'MISSING — re-run `agyp login`';
      lines.push(`  ${entry.email.padEnd(32)} ${state}`);
      lines.push(`    keychain  ${entry.keychainPath}`);
      if (entry.credentialExpiry !== null) {
        lines.push(`    refreshed until ${entry.credentialExpiry}`);
      }
      if (!entry.sandboxReady) {
        lines.push('    sandbox missing — it is rebuilt on the next `agyp use`');
      }
      if (entry.strayEntries.length > 0) {
        // Files an agy session wrote to a path that does not exist in the real
        // home stay inside the sandbox and are invisible from outside it.
        lines.push(`    only inside this sandbox: ${entry.strayEntries.join(', ')}`);
      }
    }
    return { success: true, action: 'print', payload: lines.join('\n') };
  }

  private emit(result: AgypResult): number {
    if (!result.success) {
      if (result.message !== undefined) {
        console.error(result.message);
      }
      return 1;
    }
    if (result.message !== undefined && result.action === 'export') {
      console.error(result.message);
    }
    if (result.payload !== undefined) {
      console.log(result.payload);
    }
    return 0;
  }
}
