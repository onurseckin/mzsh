import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Points the whole test process at a throwaway home before any test loads.
 *
 * macOS resolves the keychain search list from $HOME, so under this sandbox
 * even a test that reaches the real `/usr/bin/security` cannot see the login
 * keychain, and even a carelessly constructed AgypPaths lands under a temp
 * directory instead of ~/.agyp. The static isolation check refuses those
 * constructions anyway; this is the layer that holds if that check is wrong.
 */
const realHome = process.env.HOME;
const sandboxHome = mkdtempSync(join(tmpdir(), 'mzsh-test-home-'));

for (const directory of ['Library/Keychains', 'Library/Preferences', '.config', '.cache']) {
  mkdirSync(join(sandboxHome, directory), { recursive: true, mode: 0o700 });
}

process.env.HOME = sandboxHome;
process.env.XDG_CONFIG_HOME = join(sandboxHome, '.config');
process.env.XDG_CACHE_HOME = join(sandboxHome, '.cache');
// A stray bare `agyp` must refuse the menu, never block a test run on a tty.
process.env.AGYP_NO_TUI = '1';

if (realHome !== undefined && process.env.HOME === realHome) {
  throw new Error('test isolation failed: HOME still points at the real home directory');
}

process.on('exit', () => {
  rmSync(sandboxHome, { recursive: true, force: true });
});
