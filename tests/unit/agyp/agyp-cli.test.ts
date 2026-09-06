import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { AgypCli } from '../../../src/cli/agyp-cli';
import { AgypPaths } from '../../../src/domain/agyp/agyp-paths';
import { AgypVault } from '../../../src/domain/agyp/agyp-vault';
import type { LiveSession, QuotaSnapshot } from '../../../src/domain/agyp/agyp-types';
import { AgypKeychain } from '../../../src/infrastructure/agyp/agyp-keychain';
import { AgypQuotaProbe } from '../../../src/infrastructure/agyp/agyp-quota-probe';
import { AgypService } from '../../../src/infrastructure/agyp/agyp-service';
import { AgypShadowHome } from '../../../src/infrastructure/agyp/agyp-shadow-home';

const testRoot = join(process.cwd(), '.tmp', `agyp-cli-${Date.now()}`);
const fakeHome = join(testRoot, 'home');
const fakeSecurity = join(import.meta.dir, '..', '..', 'fixtures', 'fake-security.sh');

function snapshotFor(email: string, remaining: number): QuotaSnapshot {
  return {
    email,
    planName: 'Pro',
    gemini: { remainingPercentage: remaining, resetTime: null, modelCount: 11 },
    capturedAt: '2026-09-06T15:00:00Z',
    source: 'live_session',
  };
}

class StubProbe extends AgypQuotaProbe {
  public sessions: LiveSession[] = [];
  public snapshots = new Map<string, QuotaSnapshot>();

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

interface Harness {
  cli: AgypCli;
  service: AgypService;
  vault: AgypVault;
  paths: AgypPaths;
  probe: StubProbe;
  keychain: AgypKeychain;
  shadow: AgypShadowHome;
}

function buildHarness(): Harness {
  const paths = new AgypPaths(fakeHome, join(testRoot, 'vault'));
  const vault = new AgypVault(paths);
  const keychain = new AgypKeychain(fakeSecurity);
  const shadow = new AgypShadowHome(paths, keychain);
  const probe = new StubProbe();
  const service = new AgypService({ paths, vault, keychain, shadowHome: shadow, probe });
  return { cli: new AgypCli(service), service, vault, paths, probe, keychain, shadow };
}

interface Captured {
  code: number;
  out: string;
  err: string;
}

async function invoke(cli: AgypCli, argv: string[]): Promise<Captured> {
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

describe('AgypCli', () => {
  beforeEach(() => {
    mkdirSync(join(fakeHome, 'Library', 'Keychains'), { recursive: true });
    mkdirSync(join(testRoot, 'vault'), { recursive: true });
    delete process.env.AGYP_ACCOUNT;
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
    delete process.env.AGYP_ACCOUNT;
  });

  test('help exits cleanly and documents both scopes', async () => {
    const { cli } = buildHarness();
    const result = await invoke(cli, ['help']);

    expect(result.code).toBe(0);
    expect(result.out).toContain('This shell');
    expect(result.out).toContain('Global');
  });

  test('current reports an unset shell scope', async () => {
    const { cli, vault } = buildHarness();
    vault.registerAccount('person@example.com');

    const result = await invoke(cli, ['current']);
    expect(result.out).toContain('follows the global default');
    expect(result.out).toContain('person@example.com');
  });

  test('use emits shell assignments for the chosen account', async () => {
    const { cli, vault, paths, keychain, shadow } = buildHarness();
    vault.registerAccount('person@example.com');
    shadow.ensure('person@example.com', true);
    keychain.writeCredential(paths.shadowKeychain('person@example.com'), 'credential');

    const result = await invoke(cli, ['use', 'person']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('export AGYP_ACCOUNT="person@example.com"');
    expect(result.out).toContain('export AGYP_HOME=');
    expect(result.out).toContain('unset JETSKI_STANDALONE_OAUTH_TOKEN_PATH');
  });

  test('a bare account query is treated as use', async () => {
    const { cli, vault, paths, keychain, shadow } = buildHarness();
    vault.registerAccount('person@example.com');
    shadow.ensure('person@example.com', true);
    keychain.writeCredential(paths.shadowKeychain('person@example.com'), 'credential');

    const result = await invoke(cli, ['person']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('export AGYP_ACCOUNT="person@example.com"');
  });

  test('use refuses an account with no stored credential', async () => {
    const { cli, vault } = buildHarness();
    vault.registerAccount('person@example.com');

    const result = await invoke(cli, ['use', 'person']);
    expect(result.code).toBe(1);
    expect(result.err).toContain('agyp login');
  });

  test('use reports an unknown account', async () => {
    const { cli } = buildHarness();
    const result = await invoke(cli, ['use', 'nobody']);

    expect(result.code).toBe(1);
    expect(result.err).toContain('not found');
  });

  test('use requires an argument', async () => {
    const { cli } = buildHarness();
    const result = await invoke(cli, ['use']);

    expect(result.code).toBe(1);
    expect(result.err).toContain('Usage:');
  });

  test('global copies the account credential into the login keychain', async () => {
    const { cli, vault, paths, keychain, shadow } = buildHarness();
    vault.registerAccount('first@example.com');
    vault.registerAccount('second@example.com');
    shadow.ensure('second@example.com', true);
    keychain.createKeychain(paths.realKeychain, fakeHome);
    keychain.writeCredential(paths.shadowKeychain('second@example.com'), 'second-credential');

    const result = await invoke(cli, ['global', 'second']);
    expect(result.code).toBe(0);
    expect(vault.getGlobalAccount()).toBe('second@example.com');
    expect(keychain.readCredential(paths.realKeychain)).toBe('second-credential');
  });

  test('list marks the shell and global scopes and shows quota', async () => {
    const { cli, vault, probe } = buildHarness();
    vault.registerAccount('first@example.com');
    vault.registerAccount('second@example.com');
    probe.sessions = [{ pid: 1, port: 100, email: 'second@example.com' }];
    probe.snapshots.set('second@example.com', snapshotFor('second@example.com', 80.5));
    process.env.AGYP_ACCOUNT = 'second@example.com';

    const result = await invoke(cli, ['list']);
    expect(result.out).toContain('S  second@example.com');
    expect(result.out).toContain(' G first@example.com');
    expect(result.out).toContain('80.5%');
    expect(result.out).toContain('1 running');
  });

  test('quota probes an account with no live session', async () => {
    const { cli, vault, probe } = buildHarness();
    vault.registerAccount('person@example.com');
    probe.snapshots.set('person@example.com', snapshotFor('person@example.com', 0));

    const result = await invoke(cli, ['quota', 'person']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('0%');
  });

  test('doctor summarises the vault and running sessions', async () => {
    const { cli, vault, probe } = buildHarness();
    vault.registerAccount('person@example.com');
    probe.sessions = [{ pid: 42, port: 100, email: 'person@example.com' }];

    const result = await invoke(cli, ['doctor']);
    expect(result.out).toContain('accounts          1');
    expect(result.out).toContain('pid 42 port 100  person@example.com');
    expect(result.out).toContain('layered');
  });

  test('doctor confirms a stored sign-in and names the keychain holding it', async () => {
    const { cli, vault, paths, keychain, shadow } = buildHarness();
    vault.registerAccount('person@example.com');
    shadow.ensure('person@example.com', true);
    keychain.writeCredential(paths.shadowKeychain('person@example.com'), 'credential');

    const result = await invoke(cli, ['doctor']);
    expect(result.out).toContain('stored sign-ins');
    expect(result.out).toMatch(/person@example\.com\s+stored/);
    expect(result.out).toContain(paths.shadowKeychain('person@example.com'));
  });

  test('doctor flags an account whose sign-in is gone', async () => {
    const { cli, vault, shadow } = buildHarness();
    vault.registerAccount('person@example.com');
    shadow.ensure('person@example.com', true);

    const result = await invoke(cli, ['doctor']);
    expect(result.out).toContain('MISSING');
    expect(result.out).toContain('agyp login');
  });

  test('logout forgets the account and promotes a survivor', async () => {
    const { cli, vault, paths, keychain, shadow } = buildHarness();
    vault.registerAccount('first@example.com');
    vault.registerAccount('second@example.com');
    shadow.ensure('second@example.com', true);
    keychain.createKeychain(paths.realKeychain, fakeHome);
    keychain.writeCredential(paths.shadowKeychain('second@example.com'), 'second-credential');

    const result = await invoke(cli, ['logout', 'first']);
    expect(result.code).toBe(0);
    expect(vault.getGlobalAccount()).toBe('second@example.com');
    expect(result.out).toContain('Global default moved to second@example.com');
  });
});
