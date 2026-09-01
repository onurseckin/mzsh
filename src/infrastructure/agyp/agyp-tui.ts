import { closeSync, existsSync, openSync } from 'node:fs';
import process from 'node:process';
import { ReadStream as TtyReadStream, WriteStream as TtyWriteStream } from 'node:tty';
import type { AccountMetadata } from '../../domain/agyp/agyp-types';

export const AGYP_ACTION_LOGIN = '__ACTION_LOGIN__';

interface MenuItem {
  type: 'account' | 'login';
  email?: string;
  label: string;
}

interface InteractiveInputStream {
  on(event: 'data', listener: (chunk: Buffer) => void): this;
  removeListener(event: 'data', listener: (chunk: Buffer) => void): this;
  setRawMode?(mode: boolean): this;
  pause?(): this;
  resume?(): this;
  destroy?(): void;
}

interface InteractiveOutputStream {
  write(buffer: string): boolean;
  columns?: number;
  destroy?(): void;
}

export class AgypTui {
  public static async selectAccount(
    accounts: AccountMetadata[],
    activeAccount: string | null
  ): Promise<string | null> {
    let ttyIn: InteractiveInputStream | null = null;
    let ttyOut: InteractiveOutputStream | null = null;
    let customInFd: number | null = null;
    let customOutFd: number | null = null;

    if (process.stdin.isTTY && process.stdout.isTTY) {
      ttyIn = process.stdin;
      ttyOut = process.stdout;
    } else if (existsSync('/dev/tty')) {
      try {
        customInFd = openSync('/dev/tty', 'r');
        customOutFd = openSync('/dev/tty', 'w');
        ttyIn = new TtyReadStream(customInFd);
        ttyOut = new TtyWriteStream(customOutFd);
      } catch {
        // Fallback
      }
    }

    if (!ttyIn || !ttyOut) {
      return activeAccount ?? accounts[0]?.email ?? null;
    }

    const items: MenuItem[] = accounts.map((acc) => ({
      type: 'account',
      email: acc.email,
      label: acc.email,
    }));

    items.push({
      type: 'login',
      label: '+ Login & Add New Account...',
    });

    let selectedIndex = 0;
    if (activeAccount) {
      const idx = items.findIndex((item) => item.email === activeAccount);
      if (idx !== -1) selectedIndex = idx;
    }

    const render = () => {
      const cols = ttyOut.columns ?? process.stdout.columns ?? 80;
      ttyOut.write('\x1b[2J\x1b[H'); // Clear alternate buffer and home cursor
      ttyOut.write('\x1b[1;36m? Select active Antigravity account:\x1b[0m\n\n');

      items.forEach((item, i) => {
        const isSelected = i === selectedIndex;
        const cursor = isSelected ? '\x1b[1;32m> \x1b[0m' : '  ';
        const numShortcut = i < 9 ? `\x1b[2;37m${i + 1}. \x1b[0m` : '   ';

        if (item.type === 'account') {
          const isActive = item.email === activeAccount;
          const activeMarker = isActive ? '\x1b[1;32m* \x1b[0m' : '  ';
          const activeSuffix = isActive ? ' \x1b[2;32m(active)\x1b[0m' : '';
          const overhead = 2 + 3 + 2 + (isActive ? 9 : 0);
          const maxLabelWidth = Math.max(10, cols - overhead);

          let displayLabel = item.label;
          if (displayLabel.length > maxLabelWidth) {
            displayLabel = `${displayLabel.slice(0, Math.max(3, maxLabelWidth - 3))}...`;
          }

          const label = isSelected
            ? `\x1b[1;37;4m${displayLabel}\x1b[0m`
            : `\x1b[37m${displayLabel}\x1b[0m`;
          ttyOut.write(`${cursor}${numShortcut}${activeMarker}${label}${activeSuffix}\n`);
        } else {
          const overhead = 2 + 3 + 2;
          const maxLabelWidth = Math.max(10, cols - overhead);
          let displayLabel = item.label;
          if (displayLabel.length > maxLabelWidth) {
            displayLabel = `${displayLabel.slice(0, Math.max(3, maxLabelWidth - 3))}...`;
          }

          const label = isSelected
            ? `\x1b[1;33;4m${displayLabel}\x1b[0m`
            : `\x1b[33m${displayLabel}\x1b[0m`;
          ttyOut.write(`${cursor}${numShortcut}  ${label}\n`);
        }
      });

      ttyOut.write(
        '\n\x1b[2;37m[↑/↓/j/k/1-9] Navigate  •  [Enter/Space] Select  •  [q/Esc] Cancel\x1b[0m\n'
      );
    };

    return new Promise((resolve) => {
      // Enter alternate screen buffer and hide cursor
      ttyOut.write('\x1b[?1049h\x1b[?25l');

      if (typeof ttyIn.setRawMode === 'function') {
        try {
          ttyIn.setRawMode(true);
        } catch {
          // ignore
        }
      }
      if (typeof ttyIn.resume === 'function') {
        ttyIn.resume();
      }

      render();

      let cleanedUp = false;
      const proc = process as unknown as {
        on(event: string, listener: () => void): void;
        off(event: string, listener: () => void): void;
        once(event: string, listener: () => void): void;
      };

      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;

        proc.off('SIGINT', handleSignal);
        proc.off('SIGTERM', handleSignal);
        proc.off('SIGHUP', handleSignal);
        proc.off('exit', cleanup);

        ttyIn.removeListener('data', onData);
        if (typeof ttyIn.setRawMode === 'function') {
          try {
            ttyIn.setRawMode(false);
          } catch {
            // ignore
          }
        }
        if (typeof ttyIn.pause === 'function') {
          ttyIn.pause();
        }
        // Restore cursor and exit alternate screen buffer
        ttyOut.write('\x1b[?25h\x1b[?1049l');

        if (customInFd !== null) {
          try {
            ttyIn.destroy?.();
            closeSync(customInFd);
          } catch {
            // ignore
          }
        }
        if (customOutFd !== null) {
          try {
            ttyOut.destroy?.();
            closeSync(customOutFd);
          } catch {
            // ignore
          }
        }
      };

      const handleSignal = () => {
        cleanup();
        resolve(null);
      };

      proc.once('SIGINT', handleSignal);
      proc.once('SIGTERM', handleSignal);
      proc.once('SIGHUP', handleSignal);
      proc.once('exit', cleanup);

      const onData = (chunk: Buffer) => {
        const key = chunk.toString();

        // Up: ANSI (\x1b[A), SS3 (\x1bOA), 'k', Ctrl+P (\x10)
        if (key === '\x1b[A' || key === '\x1bOA' || key === 'k' || key === '\x10') {
          selectedIndex = (selectedIndex - 1 + items.length) % items.length;
          render();
        }
        // Down: ANSI (\x1b[B), SS3 (\x1bOB), 'j', Ctrl+N (\x0e)
        else if (key === '\x1b[B' || key === '\x1bOB' || key === 'j' || key === '\x0e') {
          selectedIndex = (selectedIndex + 1) % items.length;
          render();
        }
        // Direct numeric jump (1 - 9)
        else if (/^[1-9]$/.test(key)) {
          const targetIdx = parseInt(key, 10) - 1;
          if (targetIdx < items.length) {
            selectedIndex = targetIdx;
            render();
          }
        }
        // Select: Enter (\r, \n) or Space (' ')
        else if (key === '\r' || key === '\n' || key === ' ') {
          cleanup();
          const chosen = items[selectedIndex];
          if (chosen?.type === 'login') {
            resolve(AGYP_ACTION_LOGIN);
          } else {
            resolve(chosen?.email ?? null);
          }
        }
        // Cancel: Escape (\x1b), 'q', Ctrl+C (\x03)
        else if (key === '\x1b' || key === 'q' || key === '\x03') {
          cleanup();
          resolve(null);
        }
      };

      ttyIn.on('data', onData);
    });
  }
}
