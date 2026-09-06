import { describe, expect, test } from 'bun:test';
import { AgypInteractive, type AgypInteractiveService } from '../../../src/cli/agyp-interactive';
import type { AgypResult, AgypScopeState } from '../../../src/domain/agyp/agyp-types';
import type { AccountQuota } from '../../../src/infrastructure/agyp/agyp-quota-service';
import { fakeIo, snapshot, tick, track } from './agyp-tui-harness';

const ALICE = 'alice@example.com';
const BOB = 'bob@example.com';

function quota(email: string, remaining: number | null): AccountQuota {
  return {
    email,
    snapshot: remaining === null ? null : snapshot(email, remaining),
    liveSessions: [],
  };
}

class StubService implements AgypInteractiveService {
  public gatherCalls: boolean[] = [];
  public quotas: AccountQuota[] = [quota(ALICE, 80), quota(BOB, 40)];
  public scope: AgypScopeState = { sessionAccount: ALICE, globalAccount: BOB };
  public synced: string[] = [];
  public removed: string[] = [];
  public used: string[] = [];
  public loginResult: AgypResult = { success: false, message: 'Sign-in did not complete.' };

  public async gatherQuota(allowSpawn: boolean): Promise<AccountQuota[]> {
    this.gatherCalls.push(allowSpawn);
    return this.quotas;
  }

  public readScope(): AgypScopeState {
    return this.scope;
  }

  public useAccount(query: string): AgypResult {
    this.used.push(query);
    return { success: true, action: 'export', payload: `export AGYP_ACCOUNT=${query}` };
  }

  public syncGlobal(query: string): AgypResult {
    this.synced.push(query);
    this.scope = { ...this.scope, globalAccount: query };
    return { success: true, action: 'print', payload: `${query} is now the global default.` };
  }

  public removeAccount(query: string): AgypResult {
    this.removed.push(query);
    this.quotas = this.quotas.filter((entry) => entry.email !== query);
    return { success: true, action: 'print', payload: `Removed ${query}.` };
  }

  public async login(): Promise<AgypResult> {
    return this.loginResult;
  }
}

describe('AgypInteractive', () => {
  test('refresh re-reads quota with probes allowed and shows the result in place', async () => {
    const service = new StubService();
    const io = fakeIo();
    const run = track(new AgypInteractive(service).run(io));
    await tick();
    expect(service.gatherCalls).toEqual([false]);
    expect(io.output.screen()).toContain('80%');

    service.quotas = [quota(ALICE, 33), quota(BOB, 40)];
    await io.input.press('r');
    await tick();
    expect(service.gatherCalls).toEqual([false, true]);
    const screen = io.output.screen();
    expect(screen).toContain('33%');
    expect(screen).toMatch(/Quota refreshed at \d\d:\d\d:\d\d\./);
    expect(io.closeCalls).toBe(0);

    await io.input.press('\r');
    const result = await run.value();
    expect(result).toEqual({
      success: true,
      action: 'export',
      payload: `export AGYP_ACCOUNT=${ALICE}`,
    });
    expect(service.used).toEqual([ALICE]);
    expect(io.closeCalls).toBe(1);
  });

  test('probes once up front only when some account has never reported quota', async () => {
    const service = new StubService();
    service.quotas = [quota(ALICE, 80), quota(BOB, null)];
    const io = fakeIo();
    const run = track(new AgypInteractive(service).run(io));
    await tick();
    expect(service.gatherCalls).toEqual([false, true]);
    await io.input.press('q');
    expect(await run.value()).toEqual({ success: true, action: 'none' });
  });

  test('setting the global default moves the badge without leaving the menu', async () => {
    const service = new StubService();
    const io = fakeIo();
    const run = track(new AgypInteractive(service).run(io));
    await tick();
    expect(io.output.screen()).toContain(`global        ${BOB}`);

    await io.input.press('g');
    await tick();
    expect(service.synced).toEqual([ALICE]);
    const screen = io.output.screen();
    expect(screen).toContain(`global        ${ALICE}`);
    expect(screen).toContain(`${ALICE} is now the global default.`);
    expect(io.closeCalls).toBe(0);

    await io.input.press('q');
    await run.value();
    expect(io.closeCalls).toBe(1);
  });

  test('removing an account drops its row and re-reads quota cheaply', async () => {
    const service = new StubService();
    const io = fakeIo();
    const run = track(new AgypInteractive(service).run(io));
    await tick();

    await io.input.press('j');
    await io.input.press('x');
    await tick();
    expect(service.removed).toEqual([BOB]);
    expect(service.gatherCalls).toEqual([false, false]);
    // The header still names Bob as the global default; only the row goes.
    expect(io.output.screen()).not.toMatch(new RegExp(`\\d\\. .*${BOB}`));
    expect(io.output.screen()).toContain(`Removed ${BOB}.`);

    await io.input.press('q');
    await run.value();
  });

  test('a sign-in that does not complete reopens the menu with the reason', async () => {
    const service = new StubService();
    const io = fakeIo();
    const run = track(new AgypInteractive(service).run(io));
    await tick();

    await io.input.press('n');
    await tick();
    expect(io.closeCalls).toBe(1);
    expect(io.output.screen()).toContain('Sign-in did not complete.');

    await io.input.press('q');
    expect(await run.value()).toEqual({ success: true, action: 'none' });
    expect(io.closeCalls).toBe(2);
  });
});
