import type { AgypResult } from '../domain/agyp/agyp-types';
import type { AgypService } from '../infrastructure/agyp/agyp-service';
import type { AccountQuota } from '../infrastructure/agyp/agyp-quota-service';
import { AgypTui, type AgypTuiModel } from '../infrastructure/agyp/agyp-tui';
import type { AgypTuiRow } from '../infrastructure/agyp/agyp-tui-render';

function buildRows(
  quotas: readonly AccountQuota[],
  sessionAccount: string | null,
  globalAccount: string | null
): AgypTuiRow[] {
  return quotas.map((entry) => ({
    email: entry.email,
    snapshot: entry.snapshot,
    liveSessionCount: entry.liveSessions.length,
    isSession: entry.email === sessionAccount,
    isGlobal: entry.email === globalAccount,
  }));
}

/**
 * Drives the account menu.
 *
 * Everything the menu draws goes to the controlling terminal, so the export
 * script this returns still reaches the calling shell through stdout.
 */
export class AgypInteractive {
  private readonly service: AgypService;

  constructor(service: AgypService) {
    this.service = service;
  }

  private async collect(allowSpawn: boolean): Promise<AccountQuota[]> {
    return this.service.gatherQuota(allowSpawn);
  }

  /**
   * Reads quota cheaply first, then falls back to starting a throwaway `agy`
   * only for accounts that have never reported one. A first run therefore pays
   * the probe cost once instead of on every open.
   */
  private async collectForDisplay(): Promise<AccountQuota[]> {
    const fast = await this.collect(false);
    if (fast.every((entry) => entry.snapshot !== null)) {
      return fast;
    }
    process.stderr.write('\x1b[2;37mReading quota for accounts with no live session...\x1b[0m\n');
    return this.collect(true);
  }

  public async run(): Promise<AgypResult> {
    if (!AgypTui.isAvailable()) {
      return { success: false, message: 'No terminal available for the account menu.' };
    }

    let quotas = await this.collectForDisplay();
    let notice: string | null = null;

    for (;;) {
      const scope = this.service.readScope();
      const model: AgypTuiModel = {
        rows: buildRows(quotas, scope.sessionAccount, scope.globalAccount),
        sessionAccount: scope.sessionAccount,
        globalAccount: scope.globalAccount,
        notice,
      };

      const action = await AgypTui.present(model);
      notice = null;

      if (action.kind === 'cancel') {
        return { success: true, action: 'none' };
      }
      if (action.kind === 'use') {
        return this.service.useAccount(action.email);
      }
      if (action.kind === 'global') {
        const result = this.service.syncGlobal(action.email);
        notice = result.success ? (result.payload ?? null) : (result.message ?? null);
        continue;
      }
      if (action.kind === 'remove') {
        const result = this.service.removeAccount(action.email);
        notice = result.success ? (result.payload ?? null) : (result.message ?? null);
        quotas = await this.collect(false);
        continue;
      }
      if (action.kind === 'login') {
        const result = await this.service.login();
        if (result.success) {
          return result;
        }
        notice = result.message ?? 'Sign-in did not complete.';
        quotas = await this.collect(false);
        continue;
      }
      quotas = await this.collect(true);
    }
  }
}
