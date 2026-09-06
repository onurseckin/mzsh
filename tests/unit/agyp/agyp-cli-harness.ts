import { join } from 'node:path';
import { AgypCli } from '../../../src/cli/agyp-cli';
import { AgypPaths } from '../../../src/domain/agyp/agyp-paths';
import { AgypVault } from '../../../src/domain/agyp/agyp-vault';
import type { LiveSession, QuotaSnapshot } from '../../../src/domain/agyp/agyp-types';
import { AgypKeychain } from '../../../src/infrastructure/agyp/agyp-keychain';
import { AgypBackups } from '../../../src/infrastructure/agyp/agyp-backups';
import { AgypProvisioning } from '../../../src/infrastructure/agyp/agyp-provisioning';
import { AgypQuotaProbe } from '../../../src/infrastructure/agyp/agyp-quota-probe';
import { AgypService } from '../../../src/infrastructure/agyp/agyp-service';
import { AgypShadowHome } from '../../../src/infrastructure/agyp/agyp-shadow-home';

export const testRoot = join(process.cwd(), '.tmp', `agyp-cli-${Date.now()}`);
export const fakeHome = join(testRoot, 'home');
export const fakeSecurity = join(import.meta.dir, '..', '..', 'fixtures', 'fake-security.sh');

export function snapshotFor(email: string, remaining: number): QuotaSnapshot {
  return {
    email,
    planName: 'Pro',
    gemini: { remainingPercentage: remaining, resetTime: null, modelCount: 11 },
    capturedAt: '2026-09-06T15:00:00Z',
    source: 'live_session',
  };
}

export class StubProbe extends AgypQuotaProbe {
  public sessions: LiveSession[] = [];
  public snapshots = new Map<string, QuotaSnapshot>();
  /** What a watched sign-in session reports; null means it never identified. */
  public watched: QuotaSnapshot | null = null;

  public override async watchSignIn(): Promise<QuotaSnapshot | null> {
    return this.watched;
  }

  public override async discoverLiveSessions(): Promise<LiveSession[]> {
    return this.sessions;
  }

  public override async readLiveQuota(port: number): Promise<QuotaSnapshot | null> {
    const session = this.sessions.find((entry) => entry.port === port);
    return session ? (this.snapshots.get(session.email) ?? null) : null;
  }

  public override async probeShadowHome(shadowHome: string): Promise<QuotaSnapshot | null> {
    for (const [email, snapshot] of this.snapshots) {
      if (shadowHome.includes(email)) {
        return snapshot;
      }
    }
    return null;
  }
}

export interface Harness {
  cli: AgypCli;
  service: AgypService;
  vault: AgypVault;
  paths: AgypPaths;
  probe: StubProbe;
  keychain: AgypKeychain;
  shadow: AgypShadowHome;
  backups: AgypBackups;
}

export function buildHarness(agyBinary?: string): Harness {
  const paths = new AgypPaths(fakeHome, join(testRoot, 'vault'));
  const vault = new AgypVault(paths);
  const keychain = new AgypKeychain(fakeSecurity);
  const shadow = new AgypShadowHome(paths, keychain);
  const probe = new StubProbe();
  const backups = new AgypBackups(paths, keychain);
  const provisioning =
    agyBinary === undefined
      ? undefined
      : new AgypProvisioning(paths, vault, keychain, shadow, probe, backups, agyBinary);
  const service = new AgypService({
    paths,
    vault,
    keychain,
    shadowHome: shadow,
    probe,
    provisioning,
    backups,
  });
  return { cli: new AgypCli(service), service, vault, paths, probe, keychain, shadow, backups };
}

export interface Captured {
  code: number;
  out: string;
  err: string;
}

export async function invoke(cli: AgypCli, argv: string[]): Promise<Captured> {
  const out: string[] = [];
  const err: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const record =
    (sink: string[]) =>
    (...values: unknown[]): void => {
      sink.push(values.map((value) => (typeof value === 'string' ? value : '')).join(' '));
    };
  console.log = record(out);
  console.error = record(err);
  try {
    const code = await cli.run(argv);
    return { code, out: out.join('\n'), err: err.join('\n') };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}
