import { describe, expect, test } from 'bun:test';
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

  constructor(private readonly answers: readonly unknown[]) {
    super('fake-sign-in');
  }

  public override async fetchUserStatus(): Promise<unknown> {
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
});
