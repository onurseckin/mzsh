import { createReadStream, createWriteStream } from 'node:fs';
import type { AccountMetadata } from '../../domain/agyp/agyp-types';

export class AgypTui {
  public static async selectAccount(
    accounts: AccountMetadata[],
    activeAccount: string | null
  ): Promise<string | null> {
    if (accounts.length === 0) {
      return null;
    }

    if (!process.stdin.isTTY && !process.stdout.isTTY) {
      // Fallback to first or active if not in interactive terminal
      return activeAccount ?? accounts[0]?.email ?? null;
    }

    const ttyIn = process.stdin.isTTY ? process.stdin : createReadStream('/dev/tty');
    const ttyOut = process.stdout.isTTY ? process.stdout : createWriteStream('/dev/tty');

    let selectedIndex = 0;
    if (activeAccount) {
      const idx = accounts.findIndex((a) => a.email === activeAccount);
      if (idx !== -1) selectedIndex = idx;
    }

    const render = () => {
      ttyOut.write('\x1b[2J\x1b[0;0H'); // Clear and home cursor
      ttyOut.write('\x1b[1;36m? Select active Antigravity account:\x1b[0m\n\n');

      accounts.forEach((acc, i) => {
        const isSelected = i === selectedIndex;
        const isActive = acc.email === activeAccount;

        const cursor = isSelected ? '\x1b[1;32m> \x1b[0m' : '  ';
        const activeMarker = isActive ? '\x1b[1;32m* \x1b[0m' : '  ';
        const label = isSelected
          ? `\x1b[1;37;4m${acc.email}\x1b[0m`
          : `\x1b[37m${acc.email}\x1b[0m`;
        const activeSuffix = isActive ? ' \x1b[2;32m(active)\x1b[0m' : '';

        ttyOut.write(`${cursor}${activeMarker}${label}${activeSuffix}\n`);
      });

      ttyOut.write(
        '\n\x1b[2;37m[↑/↓/j/k] Navigate  •  [Enter/Space] Select  •  [q/Esc] Cancel\x1b[0m\n'
      );
    };

    return new Promise((resolve) => {
      // Configure raw mode
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
      }

      render();

      const onData = (chunk: Buffer) => {
        const key = chunk.toString();

        // Up arrow or 'k'
        if (key === '\x1b[A' || key === 'k') {
          selectedIndex = (selectedIndex - 1 + accounts.length) % accounts.length;
          render();
        }
        // Down arrow or 'j'
        else if (key === '\x1b[B' || key === 'j') {
          selectedIndex = (selectedIndex + 1) % accounts.length;
          render();
        }
        // Enter (\r or \n) or Space
        else if (key === '\r' || key === '\n' || key === ' ') {
          cleanup();
          const chosen = accounts[selectedIndex]?.email ?? null;
          resolve(chosen);
        }
        // Escape, 'q', or Ctrl+C (\x03)
        else if (key === '\x1b' || key === 'q' || key === '\x03') {
          cleanup();
          resolve(null);
        }
      };

      const cleanup = () => {
        ttyIn.removeListener('data', onData);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
          process.stdin.pause();
        }
        ttyOut.write('\x1b[2J\x1b[0;0H'); // Clean screen on exit
      };

      ttyIn.on('data', onData);
    });
  }
}
