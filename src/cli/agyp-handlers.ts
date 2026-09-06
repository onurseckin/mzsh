import type { AgypResult } from '../domain/agyp/agyp-types';
import { AgypService } from '../infrastructure/agyp/agyp-service';
import type { AccountQuota } from '../infrastructure/agyp/agyp-quota-service';
import { AgypInteractive } from './agyp-interactive';
import {
  renderJson,
  serializeAccount,
  serializeHealth,
  serializeQuota,
  serializeSessions,
  type CommandOutcome,
} from './agyp-output';

/** Signals that a low account has nowhere better to move to. */
export const NO_CANDIDATE_EXIT_CODE = 3;

function failure(message: string): CommandOutcome {
  return { exitCode: 1, error: message };
}

export class AgypHandlers {
  private readonly service: AgypService;

  constructor(service: AgypService) {
    this.service = service;
  }

  private fromResult(result: AgypResult, json?: Record<string, unknown>): CommandOutcome {
    if (!result.success) {
      return failure(result.message ?? 'Command failed.');
    }
    return {
      exitCode: 0,
      ...(result.action === 'export' ? { shell: result.payload } : { text: result.payload }),
      ...(result.message !== undefined ? { note: result.message } : {}),
      json,
    };
  }

  public use(query: string): CommandOutcome {
    const result = this.service.useAccount(query);
    if (!result.success) {
      return failure(result.message ?? `Could not use "${query}".`);
    }
    const found = this.service.vault.findAccount(query);
    const email = found.account?.email ?? query;
    const exported = this.service.buildEnvironmentExport(email);
    return this.fromResult(result, {
      account: exported.email,
      shadowHome: exported.shadowHome,
      env: { AGYP_ACCOUNT: exported.email, AGYP_HOME: exported.shadowHome },
    });
  }

  public setGlobal(query: string): CommandOutcome {
    const result = this.service.syncGlobal(query);
    return this.fromResult(result, { globalAccount: this.service.vault.getGlobalAccount() });
  }

  public sync(query?: string): CommandOutcome {
    if (query !== undefined && query.trim().length > 0) {
      return this.setGlobal(query);
    }
    const scope = this.service.readScope();
    const target = scope.sessionAccount ?? scope.globalAccount;
    if (target === null) {
      return failure('No account is bound to this shell and no global default is set.');
    }
    return this.setGlobal(target);
  }

  public async list(refresh: boolean): Promise<CommandOutcome> {
    const scope = this.service.readScope();
    const entries = await this.service.gatherQuota(refresh);
    const json = {
      sessionAccount: scope.sessionAccount,
      globalAccount: scope.globalAccount,
      accounts: entries.map((entry) =>
        serializeAccount(entry, scope.sessionAccount, scope.globalAccount)
      ),
    };
    if (entries.length === 0) {
      return { exitCode: 0, text: 'No accounts yet. Run `agyp login`.', json };
    }
    const text = entries
      .map((entry) => {
        const badges = `${entry.email === scope.sessionAccount ? 'S' : ' '}${
          entry.email === scope.globalAccount ? 'G' : ' '
        }`;
        const live = entry.liveSessions.length > 0 ? `${entry.liveSessions.length} running` : '';
        return `${badges} ${entry.email.padEnd(32)} ${AgypService.describeQuota(entry).padEnd(24)} ${live}`.trimEnd();
      })
      .join('\n');
    return { exitCode: 0, text, json };
  }

  private async gatherFor(query: string | undefined, cached: boolean): Promise<AccountQuota[]> {
    if (query === undefined || query.trim().length === 0) {
      return this.service.gatherQuota(!cached);
    }
    const found = this.service.vault.findAccount(query);
    if (!found.account) {
      return [];
    }
    return this.service.quota.gather([found.account.email], { allowSpawn: !cached });
  }

  public async quota(query: string | undefined, cached: boolean): Promise<CommandOutcome> {
    if (query !== undefined && query.trim().length > 0) {
      const found = this.service.vault.findAccount(query);
      if (!found.account) {
        return failure(found.error ?? `Account "${query}" is not in the vault.`);
      }
    }
    const entries = await this.gatherFor(query, cached);
    if (entries.length === 0) {
      return { exitCode: 0, text: 'No accounts yet. Run `agyp login`.', json: { accounts: [] } };
    }
    const scope = this.service.readScope();
    return {
      exitCode: 0,
      text: entries
        .map((entry) => `${entry.email.padEnd(32)} ${AgypService.describeQuota(entry)}`)
        .join('\n'),
      json: {
        accounts: entries.map((entry) =>
          serializeAccount(entry, scope.sessionAccount, scope.globalAccount)
        ),
      },
    };
  }

  public async best(minimum: number | undefined, cached: boolean): Promise<CommandOutcome> {
    const { entries, best } = await this.service.chooseBest(!cached, minimum);
    if (best === null) {
      const detail =
        minimum === undefined
          ? 'No account has a usable quota reading.'
          : `No account has at least ${minimum}% remaining.`;
      return { exitCode: NO_CANDIDATE_EXIT_CODE, error: detail, json: { account: null } };
    }
    const entry = entries.find((candidate) => candidate.email === best.email);
    return {
      exitCode: 0,
      text: best.email,
      json: {
        account: best.email,
        remainingPercentage: best.remainingPercentage,
        quota: serializeQuota(entry?.snapshot ?? null),
      },
    };
  }

  public async auto(threshold: number, cached: boolean): Promise<CommandOutcome> {
    const { outcome } = await this.service.planAutoSwitch(!cached, threshold);

    if (!outcome.switched) {
      return {
        exitCode: outcome.stuck ? NO_CANDIDATE_EXIT_CODE : 0,
        text: outcome.reason,
        json: { switched: false, from: outcome.from, to: null, reason: outcome.reason },
      };
    }

    const applied = this.use(outcome.to);
    if (applied.exitCode !== 0) {
      return applied;
    }
    return {
      ...applied,
      note: `Switched to ${outcome.to}. ${outcome.reason}`,
      json: {
        switched: true,
        from: outcome.from,
        to: outcome.to,
        reason: outcome.reason,
        ...applied.json,
      },
    };
  }

  public current(): CommandOutcome {
    const scope = this.service.readScope();
    return {
      exitCode: 0,
      text: [
        `this shell  ${scope.sessionAccount ?? '(unset — this shell follows the global default)'}`,
        `global      ${scope.globalAccount ?? '(none)'}`,
      ].join('\n'),
      json: { sessionAccount: scope.sessionAccount, globalAccount: scope.globalAccount },
    };
  }

  public async login(): Promise<CommandOutcome> {
    const result = await this.service.login();
    if (!result.success) {
      return failure(result.message ?? 'Sign-in did not complete.');
    }
    return this.fromResult(result, { account: this.service.readScope().globalAccount });
  }

  public async importCurrent(): Promise<CommandOutcome> {
    const result = await this.service.importCurrent();
    return this.fromResult(result, { globalAccount: this.service.vault.getGlobalAccount() });
  }

  public logout(query: string): CommandOutcome {
    const result = this.service.removeAccount(query);
    return this.fromResult(result, {
      accounts: this.service.vault.listAccounts().map((account) => account.email),
    });
  }

  public async doctor(): Promise<CommandOutcome> {
    const scope = this.service.readScope();
    const sessions = await this.service.quota.discoverLiveSessions();
    const health = this.service.inspectAccounts();

    const lines = [
      `vault             ${this.service.paths.vaultRoot}`,
      `keychain mode     ${this.service.layered ? 'layered (falls back to login keychain)' : 'strict'}`,
      `this shell        ${scope.sessionAccount ?? '(unset)'}`,
      `global default    ${scope.globalAccount ?? '(none)'}`,
      `accounts          ${health.length}`,
      `running agy       ${sessions.length}`,
      ...sessions.map((session) => `  pid ${session.pid} port ${session.port}  ${session.email}`),
      '',
      'stored sign-ins',
    ];
    if (health.length === 0) {
      lines.push('  none yet — run `agyp login`');
    }
    for (const entry of health) {
      lines.push(
        `  ${entry.email.padEnd(32)} ${entry.hasCredential ? 'stored' : 'MISSING — re-run `agyp login`'}`,
        `    keychain  ${entry.keychainPath}`
      );
      if (entry.credentialExpiry !== null) {
        lines.push(`    refreshed until ${entry.credentialExpiry}`);
      }
      lines.push(
        entry.hasMirror
          ? '    backup    in login keychain'
          : '    backup    NONE — this sign-in cannot be recovered if its keychain is re-keyed'
      );
      if (!entry.sandboxReady) {
        lines.push('    sandbox missing — it is rebuilt on the next `agyp use`');
      }
      if (entry.strayEntries.length > 0) {
        lines.push(`    only inside this sandbox: ${entry.strayEntries.join(', ')}`);
      }
    }

    return {
      exitCode: 0,
      text: lines.join('\n'),
      json: {
        vault: this.service.paths.vaultRoot,
        keychainMode: this.service.layered ? 'layered' : 'strict',
        sessionAccount: scope.sessionAccount,
        globalAccount: scope.globalAccount,
        liveSessions: serializeSessions(sessions),
        accounts: health.map(serializeHealth),
      },
    };
  }

  public async menu(): Promise<CommandOutcome> {
    const result = await new AgypInteractive(this.service).run();
    if (!result.success) {
      return failure(result.message ?? 'The menu could not be opened.');
    }
    return this.fromResult(result);
  }
}

export { renderJson };
