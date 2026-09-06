import { describe, expect, test } from 'bun:test';
import {
  formatResetHint,
  isGeminiModel,
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

describe('model selection', () => {
  test('excludes Claude and GPT models', () => {
    // They are separate products whose reported figures do not track usage,
    // so they must not influence whether an account looks usable.
    expect(isGeminiModel('Claude Opus 4.6 (Thinking)')).toBeFalse();
    expect(isGeminiModel('GPT-OSS 120B (Medium)')).toBeFalse();
  });

  test('keeps Gemini models', () => {
    expect(isGeminiModel('Gemini 3.8 Flash (High)')).toBeTrue();
  });
});

describe('parseUserStatus', () => {
  test('measures only the Gemini allowance', () => {
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

    expect(snapshot?.gemini?.remainingPercentage).toBe(80.5);
    expect(snapshot?.gemini?.modelCount).toBe(2);
    expect(snapshot?.gemini?.resetTime).toBe('r1');
  });

  test('reports an exhausted allowance as zero rather than unknown', () => {
    // A full Claude pool must not mask a spent Gemini one.
    const snapshot = parseUserStatus(
      userStatus([
        { label: 'Gemini 3.8 Flash (High)', quotaInfo: { resetTime: '2026-09-06T17:04:59Z' } },
        { label: 'Claude Sonnet 4.6 (Thinking)', quotaInfo: { remainingFraction: 1 } },
      ]),
      'live_session'
    );

    expect(snapshot?.gemini?.remainingPercentage).toBe(0);
    expect(snapshot?.gemini?.resetTime).toBe('2026-09-06T17:04:59Z');
  });

  test('takes the lowest reading when models disagree', () => {
    const snapshot = parseUserStatus(
      userStatus([
        { label: 'Gemini 3.8 Flash (High)', quotaInfo: { remainingFraction: 0.9 } },
        { label: 'Gemini 3.1 Pro (Low)', quotaInfo: { remainingFraction: 0.4 } },
      ]),
      'cache'
    );

    expect(snapshot?.gemini?.remainingPercentage).toBe(40);
  });

  test('reports no reading when nothing is metered', () => {
    const snapshot = parseUserStatus(
      userStatus([{ label: 'Claude Opus 4.6 (Thinking)', quotaInfo: { remainingFraction: 1 } }]),
      'live_session'
    );
    expect(snapshot?.gemini).toBeNull();
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
  test('formatResetHint renders a countdown', () => {
    const now = new Date('2026-09-06T15:12:00Z');
    expect(formatResetHint('2026-09-06T17:04:00Z', now)).toBe('1h 52m');
    expect(formatResetHint('2026-09-06T15:40:00Z', now)).toBe('28m');
    expect(formatResetHint('2026-09-06T15:00:00Z', now)).toBe('due');
    expect(formatResetHint(null, now)).toBe('');
  });
});
