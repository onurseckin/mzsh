import { describe, expect, test } from 'bun:test';
import {
  classifyPool,
  findPool,
  formatResetHint,
  lowestRemainingPercentage,
  parseUserStatus,
  readRemainingFraction,
} from '../../../src/domain/agyp/agyp-quota';

function userStatus(models: unknown[], email = 'person@example.com'): unknown {
  return {
    userStatus: {
      email,
      planStatus: { planInfo: { planName: 'Pro' } },
      cascadeModelConfigData: { clientModelConfigs: models },
    },
  };
}

describe('quota fraction reading', () => {
  test('treats an absent remainingFraction as fully spent', () => {
    // The language server speaks proto3 JSON, which drops zero-valued scalars.
    expect(readRemainingFraction({ resetTime: '2026-09-06T17:04:59Z' })).toBe(0);
  });

  test('treats a missing quotaInfo as fully spent', () => {
    expect(readRemainingFraction(undefined)).toBe(0);
  });

  test('keeps a reported fraction', () => {
    expect(readRemainingFraction({ remainingFraction: 0.8047511 })).toBeCloseTo(0.8047511);
  });
});

describe('pool classification', () => {
  test('routes Claude and GPT models to the premium pool', () => {
    expect(classifyPool('Claude Opus 4.6 (Thinking)')).toBe('premium');
    expect(classifyPool('GPT-OSS 120B (Medium)')).toBe('premium');
  });

  test('routes everything else to the Gemini pool', () => {
    expect(classifyPool('Gemini 3.8 Flash (High)')).toBe('gemini');
  });
});

describe('parseUserStatus', () => {
  test('separates the two metered pools', () => {
    const snapshot = parseUserStatus(
      userStatus([
        {
          label: 'Gemini 3.8 Flash (High)',
          quotaInfo: { remainingFraction: 0.805, resetTime: 'r1' },
        },
        { label: 'Gemini 3.1 Pro (Low)', quotaInfo: { remainingFraction: 0.805, resetTime: 'r1' } },
        {
          label: 'Claude Opus 4.6 (Thinking)',
          quotaInfo: { remainingFraction: 1, resetTime: 'r2' },
        },
      ]),
      'live_session'
    );

    expect(snapshot).not.toBeNull();
    expect(snapshot?.pools).toHaveLength(2);
    expect(findPool(snapshot!, 'gemini')?.remainingPercentage).toBe(80.5);
    expect(findPool(snapshot!, 'gemini')?.modelCount).toBe(2);
    expect(findPool(snapshot!, 'premium')?.remainingPercentage).toBe(100);
    expect(findPool(snapshot!, 'premium')?.resetTime).toBe('r2');
  });

  test('reports an exhausted pool as zero rather than unknown', () => {
    const snapshot = parseUserStatus(
      userStatus([
        { label: 'Gemini 3.8 Flash (High)', quotaInfo: { resetTime: '2026-09-06T17:04:59Z' } },
        { label: 'Claude Sonnet 4.6 (Thinking)', quotaInfo: { remainingFraction: 1 } },
      ]),
      'live_session'
    );

    expect(findPool(snapshot!, 'gemini')?.remainingPercentage).toBe(0);
    expect(findPool(snapshot!, 'gemini')?.resetTime).toBe('2026-09-06T17:04:59Z');
    expect(findPool(snapshot!, 'premium')?.remainingPercentage).toBe(100);
  });

  test('takes the lowest reading when a pool disagrees with itself', () => {
    const snapshot = parseUserStatus(
      userStatus([
        { label: 'Gemini 3.8 Flash (High)', quotaInfo: { remainingFraction: 0.9 } },
        { label: 'Gemini 3.1 Pro (Low)', quotaInfo: { remainingFraction: 0.4 } },
      ]),
      'cache'
    );

    expect(findPool(snapshot!, 'gemini')?.remainingPercentage).toBe(40);
  });

  test('carries the account identity and plan', () => {
    const snapshot = parseUserStatus(userStatus([], 'Person@Example.COM'), 'spawned_probe');
    expect(snapshot?.email).toBe('person@example.com');
    expect(snapshot?.planName).toBe('Pro');
    expect(snapshot?.source).toBe('spawned_probe');
  });

  test('rejects a payload with no account', () => {
    expect(parseUserStatus({ userStatus: {} }, 'live_session')).toBeNull();
    expect(parseUserStatus(null, 'live_session')).toBeNull();
  });
});

describe('summaries', () => {
  test('lowestRemainingPercentage spans every pool', () => {
    const snapshot = parseUserStatus(
      userStatus([
        { label: 'Gemini 3.8 Flash (High)', quotaInfo: {} },
        { label: 'Claude Opus 4.6 (Thinking)', quotaInfo: { remainingFraction: 1 } },
      ]),
      'live_session'
    );
    expect(lowestRemainingPercentage(snapshot!)).toBe(0);
  });

  test('formatResetHint renders a countdown', () => {
    const now = new Date('2026-09-06T15:12:00Z');
    expect(formatResetHint('2026-09-06T17:04:00Z', now)).toBe('1h 52m');
    expect(formatResetHint('2026-09-06T15:40:00Z', now)).toBe('28m');
    expect(formatResetHint('2026-09-06T15:00:00Z', now)).toBe('due');
    expect(formatResetHint(null, now)).toBe('');
  });
});
