import { spawn, type StdioOptions } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { AgypPaths } from '../../domain/agyp/agyp-paths';
import { PENDING_MIRROR_ACCOUNT } from '../../domain/agyp/agyp-types';
import type { AgypVault } from '../../domain/agyp/agyp-vault';
import type { AgypKeychain } from './agyp-keychain';
import { AgypShadowHome } from './agyp-shadow-home';
import type { AgypQuotaProbe } from './agyp-quota-probe';

export interface ProvisioningOutcome {
  success: boolean;
  email?: string;
  message: string;
}

/** Staging homes older than this are leftovers from a run that already ended. */
const STAGING_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Adds accounts to the vault.
 *
 * The stored credential carries no email claim, so identity comes from the
 * language server: first the sign-in session itself, then a probe, then the
 * email the caller supplied. A credential that still cannot be attributed is
 * kept, never discarded — a sign-in is the one thing this code must not lose.
 */
export class AgypProvisioning {
  private readonly paths: AgypPaths;
  private readonly vault: AgypVault;
  private readonly keychain: AgypKeychain;
  private readonly shadowHome: AgypShadowHome;
  private readonly probe: AgypQuotaProbe;
  private readonly agyBinary: string;

  constructor(
    paths: AgypPaths,
    vault: AgypVault,
    keychain: AgypKeychain,
    shadowHome: AgypShadowHome,
    probe: AgypQuotaProbe,
    agyBinary = 'agy'
  ) {
    this.paths = paths;
    this.vault = vault;
    this.keychain = keychain;
    this.shadowHome = shadowHome;
    this.probe = probe;
    this.agyBinary = agyBinary;
  }

  /**
   * Hands the child the real terminal.
   *
   * `agyp` is normally invoked from a shell function that captures stdout, so
   * inheriting it would pipe agy's full-screen sign-in into a variable instead
   * of showing it.
   */
  private static openTerminal(): { stdio: StdioOptions; close: () => void } {
    const opened: number[] = [];
    const close = (): void => {
      for (const descriptor of opened) {
        try {
          closeSync(descriptor);
        } catch {
          // Already closed.
        }
      }
    };

    if ((process.stdin.isTTY && process.stdout.isTTY) || !existsSync('/dev/tty')) {
      return { stdio: 'inherit', close };
    }
    try {
      const input = process.stdin.isTTY ? 'inherit' : openSync('/dev/tty', 'r');
      const output = process.stdout.isTTY ? 'inherit' : openSync('/dev/tty', 'w');
      if (typeof input === 'number') {
        opened.push(input);
      }
      if (typeof output === 'number') {
        opened.push(output);
      }
      return { stdio: [input, output, 'inherit'], close };
    } catch {
      close();
      return { stdio: 'inherit', close };
    }
  }

  private get stagingRoot(): string {
    return join(this.paths.vaultRoot, 'staging');
  }

  private stagingHome(): string {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return join(this.stagingRoot, suffix, 'home');
  }

  /**
   * Removes staging homes from earlier runs.
   *
   * agy's MCP children can outlive it with HOME still pointing at staging and
   * recreate the directory after it was deleted. The name carries the start
   * time, so age is judged from that rather than from a modification time the
   * orphans keep refreshing.
   */
  private sweepStaging(): void {
    if (!existsSync(this.stagingRoot)) {
      return;
    }
    for (const entry of readdirSync(this.stagingRoot)) {
      const started = Number.parseInt(entry.split('-')[0] ?? '', 10);
      if (Number.isFinite(started) && Date.now() - started > STAGING_MAX_AGE_MS) {
        rmSync(join(this.stagingRoot, entry), { recursive: true, force: true });
      }
    }
  }

  private prepareStaging(): { staging: string; stagingKeychain: string } {
    this.sweepStaging();
    const staging = this.stagingHome();
    mkdirSync(staging, { recursive: true, mode: 0o700 });
    const stagingKeychain = join(staging, 'Library', 'Keychains', 'agyp.keychain-db');
    // The farm matters here: without it agy sees an empty home and walks the
    // user through onboarding for a sandbox that is about to be discarded.
    this.shadowHome.buildFarm(staging);
    // Strict search list: layering the real keychain would hand agy an
    // existing account and it would never present the sign-in.
    AgypShadowHome.prepareSandbox(this.keychain, staging, stagingKeychain, [stagingKeychain]);
    return { staging, stagingKeychain };
  }

  private discardStaging(staging: string): void {
    const parent = join(staging, '..');
    if (existsSync(parent)) {
      rmSync(parent, { recursive: true, force: true });
    }
  }

  /**
   * Installs a credential blob under `email`, building the account's shadow
   * home if this is the first time we have seen it.
   */
  private adopt(email: string, blob: string, layered: boolean): boolean {
    this.shadowHome.ensure(email, layered);
    const written = this.keychain.writeCredential(this.paths.shadowKeychain(email), blob);
    if (written) {
      // Best effort: the account works without a mirror, it just could not be
      // rebuilt if its sandbox keychain is ever re-keyed out from under us.
      this.keychain.writeMirror(this.paths.realKeychain, email, blob);
      this.vault.registerAccount(email);
    }
    return written;
  }

  private async identify(staging: string, stagingKeychain: string): Promise<string | null> {
    // The spawned agy reads this keychain itself; open it first so a locked
    // keychain cannot turn into a password prompt.
    this.keychain.unlockKeychain(stagingKeychain);
    const snapshot = await this.probe.probeShadowHome(staging);
    if (snapshot) {
      this.vault.rememberQuota(snapshot);
      return snapshot.email;
    }
    return null;
  }

  /**
   * Captures whatever account the real login keychain currently holds.
   *
   * This is how an existing Antigravity install joins the vault without a
   * re-login, and how `agyp` recovers if someone signs in outside the wrapper.
   */
  public async importCurrent(layered: boolean): Promise<ProvisioningOutcome> {
    const blob = this.keychain.readCredential();
    if (blob === null) {
      return {
        success: false,
        message: 'No Antigravity credential found in the login keychain. Run `agyp login` instead.',
      };
    }

    const { staging, stagingKeychain } = this.prepareStaging();
    try {
      if (!this.keychain.writeCredential(stagingKeychain, blob)) {
        return { success: false, message: 'Could not stage the credential for identification.' };
      }
      const email = await this.identify(staging, stagingKeychain);
      if (email === null) {
        return {
          success: false,
          message:
            'Imported a credential but could not identify its account. It may have expired; run `agyp login`.',
        };
      }
      if (!this.adopt(email, blob, layered)) {
        return { success: false, message: `Could not store the credential for ${email}.` };
      }
      this.vault.setGlobalAccount(email);
      return { success: true, email, message: `Imported ${email} from the login keychain.` };
    } finally {
      this.discardStaging(staging);
    }
  }

  /**
   * Runs a real interactive `agy` in a credential-free sandbox so its own
   * sign-in flow takes over, and reads the resulting identity from that very
   * session while it runs.
   */
  public async login(layered: boolean, providedEmail?: string): Promise<ProvisioningOutcome> {
    const { staging, stagingKeychain } = this.prepareStaging();
    try {
      console.error(
        '\n\x1b[1;36mOpening Antigravity sign-in. Complete it, then quit agy.\x1b[0m\n'
      );
      const terminal = AgypProvisioning.openTerminal();
      let exited = false;
      const child = spawn(this.agyBinary, [], {
        stdio: terminal.stdio,
        env: { ...process.env, HOME: staging },
      });
      const exit = new Promise<void>((resolve) => {
        const done = (): void => {
          exited = true;
          resolve();
        };
        child.on('exit', done);
        child.on('error', done);
      });
      const watched =
        child.pid === undefined
          ? Promise.resolve(null)
          : this.probe.watchSignIn(child.pid, () => exited);
      await exit;
      terminal.close();
      const observed = await watched;

      const blob = this.keychain.readCredential(stagingKeychain);
      if (blob === null) {
        return { success: false, message: 'Sign-in did not complete; no credential was stored.' };
      }

      let email = observed?.email ?? null;
      if (observed) {
        this.vault.rememberQuota(observed);
      }
      if (email === null) {
        email = await this.identify(staging, stagingKeychain);
      }
      if (email === null && providedEmail !== undefined && providedEmail.includes('@')) {
        email = this.paths.canonicalizeEmail(providedEmail);
      }
      if (email === null) {
        // Keep the sign-in in the login keychain rather than lose it with the
        // staging home. One slot: a newer unidentified sign-in replaces it.
        const kept = this.keychain.writeMirror(
          this.paths.realKeychain,
          PENDING_MIRROR_ACCOUNT,
          blob
        );
        return {
          success: false,
          message: kept
            ? 'Signed in, but the account could not be identified. The sign-in is kept; run `agyp claim <email>` to attach it.'
            : 'Signed in, but the account could not be identified and the sign-in could not be kept. Run `agyp login <email>`.',
        };
      }

      if (!this.adopt(email, blob, layered)) {
        return { success: false, message: `Could not store the credential for ${email}.` };
      }
      return { success: true, email, message: `Added ${email} to the vault.` };
    } finally {
      this.discardStaging(staging);
    }
  }

  /**
   * Attaches a kept, unidentified sign-in to an account. The claimed email is
   * checked against what the credential actually authenticates as, so a slip
   * cannot file a sign-in under the wrong name.
   */
  public async claim(claimedEmail: string, layered: boolean): Promise<ProvisioningOutcome> {
    const blob = this.keychain.readMirror(this.paths.realKeychain, PENDING_MIRROR_ACCOUNT);
    if (blob === null) {
      return { success: false, message: 'No unidentified sign-in is waiting to be claimed.' };
    }
    const claimed = this.paths.canonicalizeEmail(claimedEmail);
    if (!this.adopt(claimed, blob, layered)) {
      return { success: false, message: `Could not store the credential for ${claimed}.` };
    }

    const shadowHome = this.paths.shadowHome(claimed);
    const verified = await this.identify(shadowHome, this.paths.shadowKeychain(claimed));
    let email = claimed;
    let note = '';
    if (verified !== null && verified !== claimed) {
      // Re-file under the real identity rather than keep a wrong label.
      this.adopt(verified, blob, layered);
      this.vault.removeAccount(claimed);
      this.shadowHome.remove(claimed);
      this.keychain.deleteMirror(this.paths.realKeychain, claimed);
      email = verified;
      note = ` It authenticates as ${verified}, not ${claimed}, so it was filed under ${verified}.`;
    }

    this.keychain.deleteMirror(this.paths.realKeychain, PENDING_MIRROR_ACCOUNT);
    return { success: true, email, message: `Attached the kept sign-in to ${email}.${note}` };
  }
}
