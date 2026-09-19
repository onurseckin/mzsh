import { describe, expect, test } from 'bun:test';
import { AgypPaths } from '../../../src/domain/agyp/agyp-paths';
import { AgypQuotaProbe } from '../../../src/infrastructure/agyp/agyp-quota-probe';

const preAuth = { userStatus: {} };
const signedIn = {
  userStatus: {
    email: 'person@example.com',
    cascadeModelConfigData: { clientModelConfigs: [] },
  },
};

/** Answers a scripted sequence, the way a booting language server does. */
class ScriptedProbe extends AgypQuotaProbe {
  public calls = 0;
  public lastCsrfToken: string | undefined = undefined;

  constructor(private readonly answers: readonly unknown[]) {
    super('fake-sign-in');
  }

  public override async fetchUserStatus(_port?: number, csrfToken?: string): Promise<unknown> {
    this.lastCsrfToken = csrfToken;
    const answer = this.answers[Math.min(this.calls, this.answers.length - 1)];
    this.calls += 1;
    return answer ?? null;
  }
}

describe('awaitIdentity', () => {
  test('keeps polling through answers that carry no account yet', async () => {
    // The endpoint responds before sign-in finishes, with no email. That is
    // "not yet", not "no": returning early here is how a sign-in got lost.
    const probe = new ScriptedProbe([preAuth, null, preAuth, signedIn]);
    const snapshot = await probe.awaitIdentity(1, 'spawned_probe', 10);

    expect(snapshot?.email).toBe('person@example.com');
    expect(probe.calls).toBe(4);
  });

  test('gives up only after the budget is spent', async () => {
    const probe = new ScriptedProbe([preAuth]);
    const snapshot = await probe.awaitIdentity(1, 'spawned_probe', 3);

    expect(snapshot).toBeNull();
    expect(probe.calls).toBe(3);
  });

  test('forwards csrfToken to fetchUserStatus', async () => {
    const probe = new ScriptedProbe([signedIn]);
    const snapshot = await probe.awaitIdentity(1, 'spawned_probe', 1, 'secret-csrf-token');

    expect(snapshot?.email).toBe('person@example.com');
    expect(probe.lastCsrfToken).toBe('secret-csrf-token');
  });
});

describe('readLiveQuota', () => {
  test('forwards csrfToken to fetchUserStatus', async () => {
    const probe = new ScriptedProbe([signedIn]);
    const snapshot = await probe.readLiveQuota(1234, 'live-session-token');

    expect(snapshot?.email).toBe('person@example.com');
    expect(probe.lastCsrfToken).toBe('live-session-token');
  });
});

describe('AgypPaths home resolution', () => {
  test('unwraps shadow home back to real home', () => {
    const originalHome = process.env.HOME;
    try {
      process.env.HOME = '/Users/testuser/.agyp/accounts/person@example.com/home';
      const paths = new AgypPaths(undefined, undefined);
      expect(paths.realHome).toBe('/Users/testuser');
      expect(paths.vaultRoot).toBe('/Users/testuser/.agyp');
      expect(paths.realKeychain).toBe('/Users/testuser/Library/Keychains/login.keychain-db');
    } finally {
      process.env.HOME = originalHome;
    }
  });

  test('respects explicit AGYP_REAL_HOME environment variable', () => {
    const originalReal = process.env.AGYP_REAL_HOME;
    try {
      process.env.AGYP_REAL_HOME = '/Custom/RealHome';
      const paths = new AgypPaths(undefined, undefined);
      expect(paths.realHome).toBe('/Custom/RealHome');
    } finally {
      if (originalReal === undefined) {
        delete process.env.AGYP_REAL_HOME;
      } else {
        process.env.AGYP_REAL_HOME = originalReal;
      }
    }
  });

  test('provides paths to Antigravity IDE globalStorage state databases', () => {
    const paths = new AgypPaths('/Users/testuser');
    expect(paths.ideStateDatabases).toEqual([
      '/Users/testuser/Library/Application Support/Antigravity/User/globalStorage/state.vscdb',
      '/Users/testuser/Library/Application Support/Antigravity/User/globalStorage/state.vscdb.backup',
      '/Users/testuser/Library/Application Support/Antigravity IDE/User/globalStorage/state.vscdb',
      '/Users/testuser/Library/Application Support/Antigravity IDE/User/globalStorage/state.vscdb.backup',
    ]);
  });
});
