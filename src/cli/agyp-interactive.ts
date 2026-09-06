import type { AgypResult } from '../domain/agyp/agyp-types';
import type { AgypService } from '../infrastructure/agyp/agyp-service';
import type { AccountQuota } from '../infrastructure/agyp/agyp-quota-service';
import {
  AgypTui,
  type AgypTuiController,
  type AgypTuiIo,
  type AgypTuiModel,
  type AgypTuiUpdate,
} from '../infrastructure/agyp/agyp-tui';
import type { AgypTuiRow } from '../infrastructure/agyp/agyp-tui-render';

/** The slice of the service the menu drives; narrow so tests can stand it in. */
export type AgypInteractiveService = Pick<
  AgypService,
  'gatherQuota' | 'readScope' | 'useAccount' | 'syncGlobal' | 'removeAccount' | 'login'
>;

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

function outcomeNotice(result: AgypResult): string | null {
  return result.success ? (result.payload ?? null) : (result.message ?? null);
}

function refreshedNotice(): string {
  const now = new Date();
  const clock = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
  return `Quota refreshed at ${clock}.`;
}

/**
 * Drives the account menu.
 *
 * Everything the menu draws goes to the controlling terminal, so the export
 * script this returns still reaches the calling shell through stdout.
 */
export class AgypInteractive {
  private readonly service: AgypInteractiveService;
  private quotas: AccountQuota[] = [];

  constructor(service: AgypInteractiveService) {
    this.service = service;
  }

  private async collect(allowSpawn: boolean): Promise<void> {
    this.quotas = await this.service.gatherQuota(allowSpawn);
  }

  /**
   * Reads quota cheaply first, then falls back to starting a throwaway `agy`
   * only for accounts that have never reported one. A first run therefore pays
   * the probe cost once instead of on every open.
   */
  private async collectForDisplay(): Promise<void> {
    await this.collect(false);
    if (this.quotas.every((entry) => entry.snapshot !== null)) {
      return;
    }
    process.stderr.write('\x1b[2;37mReading quota for accounts with no live session...\x1b[0m\n');
    await this.collect(true);
  }

  private model(notice: string | null): AgypTuiModel {
    const scope = this.service.readScope();
    return {
      rows: buildRows(this.quotas, scope.sessionAccount, scope.globalAccount),
      sessionAccount: scope.sessionAccount,
      globalAccount: scope.globalAccount,
      notice,
    };
  }

  /** Serves the actions that keep the menu open, redrawing it with the result. */
  private readonly controller: AgypTuiController = {
    update: async (action: AgypTuiUpdate): Promise<AgypTuiModel> => {
      if (action.kind === 'refresh') {
        await this.collect(true);
        return this.model(refreshedNotice());
      }
      if (action.kind === 'global') {
        return this.model(outcomeNotice(this.service.syncGlobal(action.email)));
      }
      const result = this.service.removeAccount(action.email);
      await this.collect(false);
      return this.model(outcomeNotice(result));
    },
  };

  /** `io` stands in for the controlling terminal; tests supply one. */
  public async run(io?: AgypTuiIo): Promise<AgypResult> {
    if (io === undefined && !AgypTui.isAvailable()) {
      return { success: false, message: 'No terminal available for the account menu.' };
    }

    await this.collectForDisplay();
    let notice: string | null = null;

    for (;;) {
      const action = await AgypTui.present(this.model(notice), this.controller, io);
      if (action.kind === 'cancel') {
        return { success: true, action: 'none' };
      }
      if (action.kind === 'use') {
        return this.service.useAccount(action.email);
      }
      // Sign-in needs the terminal for itself, which is why it leaves the menu.
      const result = await this.service.login();
      if (result.success) {
        return result;
      }
      notice = result.message ?? 'Sign-in did not complete.';
      await this.collect(false);
    }
  }
}
