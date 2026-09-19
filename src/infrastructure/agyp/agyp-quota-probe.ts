import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { parseUserStatus } from '../../domain/agyp/agyp-quota';
import type { LiveSession, QuotaSnapshot, QuotaSource } from '../../domain/agyp/agyp-types';

const USER_STATUS_PATH = '/exa.language_server_pb.LanguageServerService/GetUserStatus';
const PORT_POLL_INTERVAL_MS = 50;
const PORT_POLL_ATTEMPTS = 200;
const STATUS_TIMEOUT_MS = 2500;
const IDENTITY_POLL_INTERVAL_MS = 200;
// Keyring load, token validation and the user-info fetch together take a few
// seconds on a cold start; give the server room to finish authenticating.
const IDENTITY_POLL_ATTEMPTS = 30;
const SIGN_IN_WATCH_INTERVAL_MS = 500;

interface ListeningPort {
  pid: number;
  port: number;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * Reads quota from a running `agy`.
 *
 * Every `agy` process serves a loopback language server, and `GetUserStatus`
 * on it returns both the authenticated email and the per-model allowances.
 * That is the only first-party source of quota; there is no CLI subcommand and
 * no file on disk that carries it.
 */
export class AgypQuotaProbe {
  private readonly agyBinary: string;

  constructor(agyBinary = 'agy') {
    this.agyBinary = agyBinary;
  }

  private static listListeningPorts(): ListeningPort[] {
    const result = spawnSync('lsof', ['-iTCP', '-sTCP:LISTEN', '-P', '-n'], { encoding: 'utf8' });
    if (result.status !== 0 && !result.stdout) {
      return [];
    }
    const ports: ListeningPort[] = [];
    for (const line of (result.stdout ?? '').split('\n')) {
      if (!/^agy\s/.test(line)) {
        continue;
      }
      const pidMatch = /^agy\s+(\d+)\s/.exec(line);
      const portMatch = /127\.0\.0\.1:(\d+)\s+\(LISTEN\)/.exec(line);
      if (pidMatch?.[1] && portMatch?.[1]) {
        ports.push({ pid: Number(pidMatch[1]), port: Number(portMatch[1]) });
      }
    }
    return ports;
  }

  private static extractCsrfToken(pid: number): string | undefined {
    const result = spawnSync('ps', ['-ww', '-p', String(pid), '-o', 'args='], {
      encoding: 'utf8',
    });
    if (result.status !== 0 || !result.stdout) {
      return undefined;
    }
    const match = /--csrf_token(?:=|\s+)([^\s]+)/.exec(result.stdout);
    return match?.[1];
  }

  public async fetchUserStatus(port: number, csrfToken?: string): Promise<unknown> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = csrfToken ?? process.env.ANTIGRAVITY_CSRF_TOKEN;
      if (token !== undefined && token.length > 0) {
        headers['x-codeium-csrf-token'] = token;
      }
      // The language server presents a self-signed certificate on loopback.
      // `tls` is a Bun-specific fetch option, hence the widened cast.
      const requestOptions = {
        method: 'POST',
        headers,
        body: '{}',
        tls: { rejectUnauthorized: false },
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      };
      const response = await fetch(
        `https://127.0.0.1:${port}${USER_STATUS_PATH}`,
        requestOptions as unknown as RequestInit
      );
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as unknown;
    } catch {
      return null;
    }
  }

  /** Every `agy` currently running, keyed by the account it authenticated as. */
  public async discoverLiveSessions(): Promise<LiveSession[]> {
    const sessions: LiveSession[] = [];
    const seenPids = new Set<number>();

    for (const candidate of AgypQuotaProbe.listListeningPorts()) {
      if (seenPids.has(candidate.pid)) {
        continue;
      }
      const token = AgypQuotaProbe.extractCsrfToken(candidate.pid);
      const payload = await this.fetchUserStatus(candidate.port, token);
      const snapshot = payload === null ? null : parseUserStatus(payload, 'live_session');
      if (snapshot) {
        seenPids.add(candidate.pid);
        sessions.push({
          pid: candidate.pid,
          port: candidate.port,
          email: snapshot.email,
          ...(token !== undefined ? { csrfToken: token } : {}),
        });
      }
    }
    return sessions;
  }

  public async readLiveQuota(port: number, csrfToken?: string): Promise<QuotaSnapshot | null> {
    const payload = await this.fetchUserStatus(port, csrfToken);
    return payload === null ? null : parseUserStatus(payload, 'live_session');
  }

  private async awaitNewPort(before: ReadonlySet<string>): Promise<ListeningPort | null> {
    for (let attempt = 0; attempt < PORT_POLL_ATTEMPTS; attempt += 1) {
      for (const candidate of AgypQuotaProbe.listListeningPorts()) {
        if (!before.has(`${candidate.pid}:${candidate.port}`)) {
          return candidate;
        }
      }
      await delay(PORT_POLL_INTERVAL_MS);
    }
    return null;
  }

  private static terminate(child: ChildProcess, pid: number | null): void {
    try {
      if (pid !== null) {
        process.kill(pid, 'SIGTERM');
      }
    } catch {
      // Already gone.
    }
    try {
      child.kill('SIGTERM');
    } catch {
      // Already gone.
    }
  }

  private static portsForPid(pid: number): number[] {
    return AgypQuotaProbe.listListeningPorts()
      .filter((entry) => entry.pid === pid)
      .map((entry) => entry.port);
  }

  /**
   * Polls a language server until it reports an authenticated account.
   *
   * `GetUserStatus` answers before sign-in has finished, with no email in the
   * payload. That is "not yet", not "no": treating it as failure is exactly
   * how a valid sign-in got discarded.
   */
  public async awaitIdentity(
    port: number,
    source: QuotaSource,
    attempts: number = IDENTITY_POLL_ATTEMPTS,
    csrfToken?: string
  ): Promise<QuotaSnapshot | null> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const payload = await this.fetchUserStatus(port, csrfToken);
      const snapshot = payload === null ? null : parseUserStatus(payload, source);
      if (snapshot) {
        return snapshot;
      }
      await delay(IDENTITY_POLL_INTERVAL_MS);
    }
    return null;
  }

  /**
   * Follows an `agy` the user is signing into and returns the account it was
   * authenticated as when it exited.
   *
   * Reading identity from the session itself removes the need to start a
   * second process afterwards and race its start-up. The last reading wins
   * so a sign-out and sign-in inside the same session is honoured.
   */
  public async watchSignIn(
    pid: number,
    hasExited: () => boolean,
    csrfToken?: string
  ): Promise<QuotaSnapshot | null> {
    let latest: QuotaSnapshot | null = null;
    while (!hasExited()) {
      const [port] = AgypQuotaProbe.portsForPid(pid);
      if (port !== undefined) {
        const payload = await this.fetchUserStatus(port, csrfToken);
        const snapshot = payload === null ? null : parseUserStatus(payload, 'live_session');
        if (snapshot) {
          latest = snapshot;
        }
      }
      await delay(SIGN_IN_WATCH_INTERVAL_MS);
    }
    return latest;
  }

  /**
   * Starts a throwaway `agy` under the account's shadow home purely to read its
   * quota, then stops it. `models` is used because it boots the language server
   * and exits on its own without spending any allowance.
   */
  public async probeShadowHome(shadowHome: string): Promise<QuotaSnapshot | null> {
    const before = new Set(
      AgypQuotaProbe.listListeningPorts().map((entry) => `${entry.pid}:${entry.port}`)
    );
    const csrfToken = randomUUID();

    const child = spawn(this.agyBinary, ['--csrf_token', csrfToken, 'models'], {
      env: { ...process.env, HOME: shadowHome },
      stdio: 'ignore',
    });
    child.on('error', () => {
      // Reported through a null snapshot below.
    });

    try {
      const discovered = await this.awaitNewPort(before);
      if (!discovered) {
        return null;
      }
      return await this.awaitIdentity(
        discovered.port,
        'spawned_probe',
        IDENTITY_POLL_ATTEMPTS,
        csrfToken
      );
    } finally {
      AgypQuotaProbe.terminate(child, child.pid ?? null);
    }
  }
}
