import { formatResetHint } from '../../domain/agyp/agyp-quota';
import type { QuotaSnapshot } from '../../domain/agyp/agyp-types';

export interface AgypTuiRow {
  email: string;
  snapshot: QuotaSnapshot | null;
  liveSessionCount: number;
  isSession: boolean;
  isGlobal: boolean;
}

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const DIM = '\x1b[2;37m';
const RESET = '\x1b[0m';

/** Healthy above half, tight in the middle, spent at the bottom. */
export function quotaColour(remainingPercentage: number): string {
  if (remainingPercentage >= 50) {
    return GREEN;
  }
  return remainingPercentage >= 15 ? YELLOW : RED;
}

export function formatPoolCell(
  label: string,
  percentage: number,
  resetTime: string | null
): string {
  const colour = quotaColour(percentage);
  const value = percentage === 0 ? 'empty' : `${percentage}%`;
  const hint = formatResetHint(resetTime);
  const reset = hint.length > 0 ? ` ${DIM}(${hint})${RESET}` : '';
  return `${DIM}${label}${RESET} ${colour}${value.padEnd(6)}${RESET}${reset}`;
}

export function formatQuotaCells(snapshot: QuotaSnapshot | null): string {
  if (!snapshot) {
    return `${DIM}quota unavailable${RESET}`;
  }
  if (snapshot.pools.length === 0) {
    return `${DIM}no metered models${RESET}`;
  }
  const cells = snapshot.pools.map((pool) =>
    formatPoolCell(pool.label, pool.remainingPercentage, pool.resetTime)
  );
  const stale = snapshot.source === 'cache' ? ` ${DIM}[cached]${RESET}` : '';
  return `${cells.join('   ')}${stale}`;
}

/**
 * Scope badges. `S` marks the account bound to this shell, `G` the one mirrored
 * into the login keychain for the IDE. An account can hold both, or neither.
 */
export function formatScopeBadge(row: AgypTuiRow): string {
  const session = row.isSession ? `${GREEN}S${RESET}` : ' ';
  const global = row.isGlobal ? `${YELLOW}G${RESET}` : ' ';
  return `${session}${global}`;
}

export function formatLiveBadge(liveSessionCount: number): string {
  return liveSessionCount > 0 ? `${DIM}${liveSessionCount} running${RESET}` : '';
}

export function truncate(value: string, maxWidth: number): string {
  if (value.length <= maxWidth) {
    return value;
  }
  return `${value.slice(0, Math.max(3, maxWidth - 3))}...`;
}

export function formatScopeHeader(
  sessionAccount: string | null,
  globalAccount: string | null
): string[] {
  const sessionValue =
    sessionAccount ?? `${DIM}unset — this shell follows the global default${RESET}`;
  const globalValue = globalAccount ?? `${DIM}none${RESET}`;
  return [
    `  ${GREEN}S${RESET} this shell    ${sessionValue}`,
    `  ${YELLOW}G${RESET} global        ${globalValue} ${DIM}(IDE and unwrapped agy)${RESET}`,
  ];
}

export function formatRow(
  row: AgypTuiRow,
  index: number,
  selected: boolean,
  columns: number
): string {
  const cursor = selected ? `${GREEN}>${RESET} ` : '  ';
  const ordinal = index < 9 ? `${DIM}${index + 1}.${RESET} ` : '    ';
  const badge = formatScopeBadge(row);

  const emailWidth = Math.max(18, Math.min(34, columns - 46));
  const emailText = truncate(row.email, emailWidth).padEnd(emailWidth);
  const email = selected ? `\x1b[1;37m${emailText}${RESET}` : `\x1b[37m${emailText}${RESET}`;

  const live = formatLiveBadge(row.liveSessionCount);
  const quota = formatQuotaCells(row.snapshot);
  return `${cursor}${ordinal}${badge} ${email}  ${quota}  ${live}`;
}

export const AGYP_TUI_KEY_HINTS =
  '[↑/↓/j/k] move  •  [Enter] use here  •  [g] set global  •  [r] refresh  •  [n] add  •  [x] remove  •  [q] quit';
