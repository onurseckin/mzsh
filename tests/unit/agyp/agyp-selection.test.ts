import { describe, expect, test } from 'bun:test';
import {
  chooseBestAccount,
  decideAutoSwitch,
  DEFAULT_SWITCH_THRESHOLD,
  type AccountQuotaView,
} from '../../../src/domain/agyp/agyp-selection';

const views = (...pairs: [string, number | null][]): AccountQuotaView[] =>
  pairs.map(([email, remainingPercentage]) => ({ email, remainingPercentage }));

describe('chooseBestAccount', () => {
  test('picks the account with the most left', () => {
    const best = chooseBestAccount(views(['low@x.com', 20], ['high@x.com', 80]));
    expect(best?.email).toBe('high@x.com');
  });

  test('never picks an account with no reading', () => {
    // Switching to an unmeasured account is how an agent lands on an
    // exhausted one, so an unknown reading is not a candidate.
    const best = chooseBestAccount(views(['known@x.com', 5], ['unknown@x.com', null]));
    expect(best?.email).toBe('known@x.com');
  });

  test('returns null when nothing has a reading', () => {
    expect(chooseBestAccount(views(['a@x.com', null]))).toBeNull();
  });

  test('honours a minimum', () => {
    expect(chooseBestAccount(views(['a@x.com', 10], ['b@x.com', 20]), 50)).toBeNull();
    expect(chooseBestAccount(views(['a@x.com', 10], ['b@x.com', 60]), 50)?.email).toBe('b@x.com');
  });
});

describe('decideAutoSwitch', () => {
  test('stays put when the current account is above the threshold', () => {
    const outcome = decideAutoSwitch('a@x.com', views(['a@x.com', 60], ['b@x.com', 90]), 15);
    expect(outcome.switched).toBeFalse();
    expect(outcome).toMatchObject({ stuck: false });
  });

  test('moves to the best account when the current one is low', () => {
    const outcome = decideAutoSwitch('a@x.com', views(['a@x.com', 3], ['b@x.com', 90]), 15);
    expect(outcome).toMatchObject({ switched: true, from: 'a@x.com', to: 'b@x.com' });
  });

  test('reports being stuck when low with nowhere better', () => {
    // The distinction matters: an unattended caller must be able to tell
    // "you are fine" from "you are low and out of options".
    const outcome = decideAutoSwitch('a@x.com', views(['a@x.com', 3], ['b@x.com', 1]), 15);
    expect(outcome).toMatchObject({ switched: false, stuck: true });
  });

  test('binds an account when the shell has none', () => {
    const outcome = decideAutoSwitch(null, views(['a@x.com', 40]), 15);
    expect(outcome).toMatchObject({ switched: true, from: null, to: 'a@x.com' });
  });

  test('moves off an account whose quota cannot be read', () => {
    const outcome = decideAutoSwitch('a@x.com', views(['a@x.com', null], ['b@x.com', 30]), 15);
    expect(outcome).toMatchObject({ switched: true, to: 'b@x.com' });
  });

  test('is stuck when no account anywhere has a reading', () => {
    const outcome = decideAutoSwitch('a@x.com', views(['a@x.com', null]), 15);
    expect(outcome).toMatchObject({ switched: false, stuck: true });
  });

  test('exposes a default threshold', () => {
    expect(DEFAULT_SWITCH_THRESHOLD).toBeGreaterThan(0);
    expect(DEFAULT_SWITCH_THRESHOLD).toBeLessThan(100);
  });
});
