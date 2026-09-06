import { describe, expect, test } from 'bun:test';
import {
  formatPoolCell,
  formatQuotaCells,
  formatRow,
  formatScopeBadge,
  formatScopeHeader,
  quotaColour,
  truncate,
  type AgypTuiRow,
} from '../../../src/infrastructure/agyp/agyp-tui-render';
import type { QuotaSnapshot } from '../../../src/domain/agyp/agyp-types';

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

function snapshotWith(
  remaining: number,
  source: QuotaSnapshot['source'] = 'live_session'
): QuotaSnapshot {
  return {
    email: 'person@example.com',
    planName: 'Pro',
    pools: [
      {
        id: 'gemini',
        label: 'Gemini',
        remainingPercentage: remaining,
        resetTime: null,
        modelCount: 11,
      },
      {
        id: 'premium',
        label: 'Claude/GPT',
        remainingPercentage: 100,
        resetTime: null,
        modelCount: 3,
      },
    ],
    capturedAt: '2026-09-06T15:00:00Z',
    source,
  };
}

const baseRow: AgypTuiRow = {
  email: 'person@example.com',
  snapshot: snapshotWith(80.5),
  liveSessionCount: 0,
  isSession: false,
  isGlobal: false,
};

describe('quota colouring', () => {
  test('separates healthy, tight and spent', () => {
    expect(quotaColour(80)).not.toBe(quotaColour(20));
    expect(quotaColour(20)).not.toBe(quotaColour(0));
    expect(quotaColour(50)).toBe(quotaColour(100));
  });
});

describe('quota cells', () => {
  test('spells out an empty pool rather than showing 0%', () => {
    expect(stripAnsi(formatPoolCell('Gemini', 0, null))).toContain('empty');
  });

  test('appends a reset countdown when one is known', () => {
    const future = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    expect(stripAnsi(formatPoolCell('Gemini', 40, future))).toMatch(/\(\d+m\)/);
  });

  test('renders both pools', () => {
    const rendered = stripAnsi(formatQuotaCells(snapshotWith(80.5)));
    expect(rendered).toContain('Gemini');
    expect(rendered).toContain('80.5%');
    expect(rendered).toContain('Claude/GPT');
  });

  test('flags a cached reading', () => {
    expect(stripAnsi(formatQuotaCells(snapshotWith(80.5, 'cache')))).toContain('[cached]');
  });

  test('says so when there is no reading at all', () => {
    expect(stripAnsi(formatQuotaCells(null))).toContain('quota unavailable');
  });
});

describe('scope badges', () => {
  test('marks the shell scope and the global scope independently', () => {
    expect(stripAnsi(formatScopeBadge({ ...baseRow, isSession: true }))).toBe('S ');
    expect(stripAnsi(formatScopeBadge({ ...baseRow, isGlobal: true }))).toBe(' G');
    expect(stripAnsi(formatScopeBadge({ ...baseRow, isSession: true, isGlobal: true }))).toBe('SG');
    expect(stripAnsi(formatScopeBadge(baseRow))).toBe('  ');
  });

  test('header explains an unset shell scope', () => {
    const [session, global] = formatScopeHeader(null, 'person@example.com').map(stripAnsi);
    expect(session).toContain('follows the global default');
    expect(global).toContain('person@example.com');
  });
});

describe('rows', () => {
  test('shows the account, quota and running-session count', () => {
    const rendered = stripAnsi(formatRow({ ...baseRow, liveSessionCount: 2 }, 0, true, 120));
    expect(rendered).toContain('person@example.com');
    expect(rendered).toContain('Gemini');
    expect(rendered).toContain('2 running');
    expect(rendered).toContain('1.');
  });

  test('omits the running badge when nothing is running', () => {
    expect(stripAnsi(formatRow(baseRow, 0, false, 120))).not.toContain('running');
  });

  test('truncates rather than wrapping a narrow terminal', () => {
    expect(truncate('a-very-long-account@example.com', 12)).toBe('a-very-lo...');
    expect(truncate('short', 12)).toBe('short');
  });
});
