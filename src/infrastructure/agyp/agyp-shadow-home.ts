import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { AgypPaths } from '../../domain/agyp/agyp-paths';
import type { AgypKeychain } from './agyp-keychain';

export interface ShadowHomeReport {
  shadowHome: string;
  topLevelLinks: number;
  libraryLinks: number;
  preferenceLinks: number;
  keychainCreated: boolean;
  searchListApplied: boolean;
  defaultKeychainApplied: boolean;
}

/**
 * Builds the per-account shadow home.
 *
 * Everything in the real home is mirrored as a symlink so tools invoked inside
 * an agy session still find `.gitconfig`, `.ssh`, `.config` and friends. Only
 * `Library/Keychains` is a real directory, because that is the single thing
 * that has to differ for `agy` to resolve a different Antigravity identity.
 */
export class AgypShadowHome {
  private readonly paths: AgypPaths;
  private readonly keychain: AgypKeychain;

  constructor(paths: AgypPaths, keychain: AgypKeychain) {
    this.paths = paths;
    this.keychain = keychain;
  }

  private static linkEntry(target: string, linkPath: string): boolean {
    try {
      const existing = lstatSync(linkPath, { throwIfNoEntry: false });
      if (existing?.isSymbolicLink()) {
        if (readlinkSync(linkPath) === target) {
          return false;
        }
        rmSync(linkPath, { force: true });
      } else if (existing) {
        // A real file or directory here is account-private state; leave it be.
        return false;
      }
      symlinkSync(target, linkPath);
      return true;
    } catch {
      return false;
    }
  }

  private static mirrorDirectory(
    sourceDirectory: string,
    targetDirectory: string,
    excluded: readonly string[]
  ): number {
    if (!existsSync(sourceDirectory)) {
      return 0;
    }
    let created = 0;
    let entries: string[];
    try {
      entries = readdirSync(sourceDirectory);
    } catch {
      return 0;
    }
    for (const entry of entries) {
      if (excluded.includes(entry)) {
        continue;
      }
      const linked = AgypShadowHome.linkEntry(
        join(sourceDirectory, entry),
        join(targetDirectory, entry)
      );
      if (linked) {
        created += 1;
      }
    }
    return created;
  }

  /**
   * Wires a sandbox home's keychain.
   *
   * `Library/Preferences` must already exist: `security` records both the
   * search list and the default keychain in `com.apple.security.plist` there,
   * and silently keeps neither when the directory is missing.
   */
  public static prepareSandbox(
    keychain: AgypKeychain,
    home: string,
    keychainPath: string,
    searchList: readonly string[]
  ): { keychainCreated: boolean; searchListApplied: boolean; defaultKeychainApplied: boolean } {
    mkdirSync(join(home, 'Library', 'Preferences'), { recursive: true, mode: 0o700 });
    mkdirSync(dirname(keychainPath), { recursive: true, mode: 0o700 });

    const keychainCreated = keychain.createKeychain(keychainPath, home);
    // Applied on every call, not just creation: keychains made before this was
    // in place still carry the auto-locking default.
    keychain.disableAutoLock(keychainPath);
    const searchListApplied = keychain.setSearchList(home, searchList);
    // Reads follow the search list, writes follow the default. agy does both.
    const defaultKeychainApplied = keychain.setDefaultKeychain(home, keychainPath);
    return { keychainCreated, searchListApplied, defaultKeychainApplied };
  }

  /**
   * Mirrors the real home into `home` as symlinks.
   *
   * Used for account sandboxes and for the throwaway sandbox a sign-in runs
   * in, so a new account sees the same shared `.gemini` — settings, skills and
   * MCP servers included — instead of being asked to onboard from scratch.
   */
  public buildFarm(home: string): {
    topLevelLinks: number;
    libraryLinks: number;
    preferenceLinks: number;
  } {
    const libraryDirectory = join(home, 'Library');
    const preferencesDirectory = join(libraryDirectory, 'Preferences');
    mkdirSync(preferencesDirectory, { recursive: true, mode: 0o700 });

    const topLevelLinks = AgypShadowHome.mirrorDirectory(
      this.paths.realHome,
      home,
      this.paths.excludedHomeEntries
    );
    const libraryLinks = AgypShadowHome.mirrorDirectory(
      join(this.paths.realHome, 'Library'),
      libraryDirectory,
      this.paths.excludedLibraryEntries
    );
    // Preferences is mirrored entry by entry so the account keeps every real
    // preference file while owning its own keychain search list.
    const preferenceLinks = AgypShadowHome.mirrorDirectory(
      join(this.paths.realHome, 'Library', 'Preferences'),
      preferencesDirectory,
      this.paths.excludedPreferenceEntries
    );

    return { topLevelLinks, libraryLinks, preferenceLinks };
  }

  /**
   * Creates or refreshes an account sandbox. Safe to call on every switch: the
   * real home gains new top-level directories over time and a stale farm would
   * hide them from agy sessions.
   */
  public ensure(email: string, layered: boolean): ShadowHomeReport {
    const shadowHome = this.paths.shadowHome(email);
    mkdirSync(this.paths.shadowKeychainDir(email), { recursive: true, mode: 0o700 });

    const farm = this.buildFarm(shadowHome);
    const keychainPath = this.paths.shadowKeychain(email);
    const searchList = layered ? [keychainPath, this.paths.realKeychain] : [keychainPath];
    const wiring = AgypShadowHome.prepareSandbox(
      this.keychain,
      shadowHome,
      keychainPath,
      searchList
    );

    return { shadowHome, ...farm, ...wiring };
  }

  public exists(email: string): boolean {
    return existsSync(this.paths.shadowKeychain(email));
  }

  public remove(email: string): void {
    const accountDirectory = this.paths.accountDir(email);
    if (existsSync(accountDirectory)) {
      rmSync(accountDirectory, { recursive: true, force: true });
    }
  }

  /**
   * Reports shadow-home entries that are real files rather than symlinks.
   * Anything an agy session wrote to a path that did not yet exist in the real
   * home lands here and is otherwise invisible from outside the sandbox.
   */
  public strayEntries(email: string): string[] {
    const shadowHome = this.paths.shadowHome(email);
    if (!existsSync(shadowHome)) {
      return [];
    }
    const stray: string[] = [];
    for (const entry of readdirSync(shadowHome)) {
      if (entry === 'Library') {
        continue;
      }
      const entryPath = join(shadowHome, entry);
      const stats = lstatSync(entryPath, { throwIfNoEntry: false });
      if (stats && !stats.isSymbolicLink()) {
        stray.push(entry);
      }
    }
    return stray;
  }
}
