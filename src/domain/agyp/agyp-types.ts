/**
 * Antigravity multi-account vault types.
 *
 * The credential `agy` actually reads is a macOS generic password
 * (service `gemini`, account `antigravity`) resolved from `$HOME`, not the
 * `jetski-standalone-oauth-token` file. Every type here is shaped around that.
 */

export const KEYCHAIN_SERVICE = 'gemini';
export const KEYCHAIN_ACCOUNT = 'antigravity';

/**
 * Service name for agyp's own copy of each credential, kept in the real login
 * keychain under the account's email.
 *
 * A sandbox keychain is the working copy, but it carries an empty password and
 * anything that re-keys it orphans the sign-in beyond recovery. The login
 * keychain is unlocked by macOS at login and survives that, so it is the copy
 * an account can actually be rebuilt from.
 */
export const MIRROR_SERVICE = 'agyp';

/**
 * Mirror account under which a sign-in whose identity could not be read is
 * kept until `agyp claim <email>` attaches it. One slot: the newest wins.
 */
export const PENDING_MIRROR_ACCOUNT = 'pending';

/** zalando/go-keyring wraps non-trivial secrets with this marker before base64. */
export const GO_KEYRING_BASE64_PREFIX = 'go-keyring-base64:';

export interface AccountMetadata {
  email: string;
  addedAt: string;
  lastUsedAt: string;
}

export interface AccountRegistry {
  version: 2;
  /** Account mirrored into the real login keychain, used by the IDE and unwrapped `agy`. */
  globalAccount: string | null;
  accounts: AccountMetadata[];
}

/**
 * An account's Gemini allowance: the one figure that decides whether the
 * account can still do work.
 */
export interface QuotaReading {
  /** 0-100. Absent `remainingFraction` in the payload means exactly zero. */
  remainingPercentage: number;
  resetTime: string | null;
  modelCount: number;
}

export type QuotaSource = 'live_session' | 'spawned_probe' | 'cache';

export interface QuotaSnapshot {
  email: string;
  planName: string | null;
  gemini: QuotaReading | null;
  capturedAt: string;
  source: QuotaSource;
}

export interface QuotaCache {
  version: 1;
  snapshots: Record<string, QuotaSnapshot>;
}

/** A running `agy` process discovered through its loopback language-server port. */
export interface LiveSession {
  pid: number;
  port: number;
  email: string;
}

export interface AgypEnvironmentExport {
  email: string;
  shadowHome: string;
  exportScript: string;
}

export interface AgypScopeState {
  /** Account bound to the invoking shell via `AGYP_ACCOUNT`. */
  sessionAccount: string | null;
  /** Account mirrored into the real login keychain. */
  globalAccount: string | null;
}

export interface AgypResult {
  success: boolean;
  message?: string;
  action?: 'export' | 'print' | 'none';
  payload?: string;
}
