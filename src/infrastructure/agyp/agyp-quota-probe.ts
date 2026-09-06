import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { parseUserStatus } from '../../domain/agyp/agyp-quota';
import type { LiveSession, QuotaSnapshot } from '../../domain/agyp/agyp-types';

const USER_STATUS_PATH = '/exa.language_server_pb.LanguageServerService/GetUserStatus';
const PORT_POLL_INTERVAL_MS = 50;
const PORT_POLL_ATTEMPTS = 200;
const STATUS_RETRY_ATTEMPTS = 12;
const STATUS_RETRY_INTERVAL_MS = 200;
const STATUS_TIMEOUT_MS = 2500;

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

  public async fetchUserStatus(port: number): Promise<unknown> {
    try {
      // The language server presents a self-signed certificate on loopback.
      // `tls` is a Bun-specific fetch option, hence the widened cast.
      const requestOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const payload = await this.fetchUserStatus(candidate.port);
      const snapshot = payload === null ? null : parseUserStatus(payload, 'live_session');
      if (snapshot) {
        seenPids.add(candidate.pid);
        sessions.push({ pid: candidate.pid, port: candidate.port, email: snapshot.email });
      }
    }
    return sessions;
  }

  public async readLiveQuota(port: number): Promise<QuotaSnapshot | null> {
    const payload = await this.fetchUserStatus(port);
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

  /**
   * Starts a throwaway `agy` under the account's shadow home purely to read its
   * quota, then stops it. `models` is used because it boots the language server
   * and exits on its own without spending any allowance.
   */
  public async probeShadowHome(shadowHome: string): Promise<QuotaSnapshot | null> {
    const before = new Set(
      AgypQuotaProbe.listListeningPorts().map((entry) => `${entry.pid}:${entry.port}`)
    );

    const child = spawn(this.agyBinary, ['models'], {
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
      for (let attempt = 0; attempt < STATUS_RETRY_ATTEMPTS; attempt += 1) {
        const payload = await this.fetchUserStatus(discovered.port);
        if (payload !== null) {
          return parseUserStatus(payload, 'spawned_probe');
        }
        await delay(STATUS_RETRY_INTERVAL_MS);
      }
      return null;
    } finally {
      AgypQuotaProbe.terminate(child, child.pid ?? null);
    }
  }
}
