import { spawnSync, type StdioOptions } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { AgypPaths } from '../../domain/agyp/agyp-paths';
import type { AgypVault } from '../../domain/agyp/agyp-vault';
import type { AgypKeychain } from './agyp-keychain';
import { AgypShadowHome } from './agyp-shadow-home';
import type { AgypQuotaProbe } from './agyp-quota-probe';

export interface ProvisioningOutcome {
  success: boolean;
  email?: string;
  message: string;
}

/**
 * Adds accounts to the vault.
 *
 * The stored credential carries no email claim, so identity always comes from
 * a language-server probe rather than from the token itself.
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

    if (process.stdin.isTTY && process.stdout.isTTY) {
      return { stdio: 'inherit', close };
    }
    if (!existsSync('/dev/tty')) {
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

  private stagingHome(): string {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return join(this.paths.vaultRoot, 'staging', suffix, 'home');
  }

  /**
   * Installs a credential blob under `email`, building the account's shadow
   * home if this is the first time we have seen it.
   */
  private adopt(email: string, blob: string, layered: boolean): boolean {
    this.shadowHome.ensure(email, layered);
    const written = this.keychain.writeCredential(this.paths.shadowKeychain(email), blob);
    if (written) {
      this.vault.registerAccount(email);
    }
    return written;
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

    const staging = this.stagingHome();
    try {
      mkdirSync(staging, { recursive: true, mode: 0o700 });
      const stagingKeychain = join(staging, 'Library', 'Keychains', 'agyp.keychain-db');
      // The farm matters here: without it agy sees an empty home and walks the
      // user through onboarding for a sandbox that is about to be discarded.
      this.shadowHome.buildFarm(staging);
      // Strict search list: layering the real keychain would hand agy an
      // existing account and it would never present the sign-in.
      AgypShadowHome.prepareSandbox(this.keychain, staging, stagingKeychain, [stagingKeychain]);
      if (!this.keychain.writeCredential(stagingKeychain, blob)) {
        return { success: false, message: 'Could not stage the credential for identification.' };
      }

      const snapshot = await this.probe.probeShadowHome(staging);
      if (!snapshot) {
        return {
          success: false,
          message:
            'Imported a credential but could not identify its account. It may have expired; run `agyp login`.',
        };
      }

      if (!this.adopt(snapshot.email, blob, layered)) {
        return { success: false, message: `Could not store the credential for ${snapshot.email}.` };
      }
      this.vault.rememberQuota(snapshot);
      this.vault.setGlobalAccount(snapshot.email);
      return {
        success: true,
        email: snapshot.email,
        message: `Imported ${snapshot.email} from the login keychain.`,
      };
    } finally {
      rmSync(join(staging, '..'), { recursive: true, force: true });
    }
  }

  /**
   * Runs a real interactive `agy` in a credential-free sandbox so its own
   * sign-in flow takes over. The sandbox deliberately does not layer the real
   * keychain, otherwise `agy` would find an existing account and never prompt.
   */
  public async login(layered: boolean): Promise<ProvisioningOutcome> {
    const staging = this.stagingHome();
    try {
      mkdirSync(staging, { recursive: true, mode: 0o700 });
      const stagingKeychain = join(staging, 'Library', 'Keychains', 'agyp.keychain-db');
      // The farm matters here: without it agy sees an empty home and walks the
      // user through onboarding for a sandbox that is about to be discarded.
      this.shadowHome.buildFarm(staging);
      // Strict search list: layering the real keychain would hand agy an
      // existing account and it would never present the sign-in.
      AgypShadowHome.prepareSandbox(this.keychain, staging, stagingKeychain, [stagingKeychain]);

      console.error(
        '\n\x1b[1;36mOpening Antigravity sign-in. Complete it, then quit agy.\x1b[0m\n'
      );
      const terminal = AgypProvisioning.openTerminal();
      try {
        spawnSync(this.agyBinary, [], {
          stdio: terminal.stdio,
          env: { ...process.env, HOME: staging },
        });
      } finally {
        terminal.close();
      }

      const blob = this.keychain.readCredential(stagingKeychain);
      if (blob === null) {
        return { success: false, message: 'Sign-in did not complete; no credential was stored.' };
      }

      const snapshot = await this.probe.probeShadowHome(staging);
      if (!snapshot) {
        return { success: false, message: 'Signed in but could not read the account identity.' };
      }

      if (!this.adopt(snapshot.email, blob, layered)) {
        return { success: false, message: `Could not store the credential for ${snapshot.email}.` };
      }
      this.vault.rememberQuota(snapshot);
      return {
        success: true,
        email: snapshot.email,
        message: `Added ${snapshot.email} to the vault.`,
      };
    } finally {
      const stagingParent = join(staging, '..');
      if (existsSync(stagingParent)) {
        rmSync(stagingParent, { recursive: true, force: true });
      }
    }
  }
}
