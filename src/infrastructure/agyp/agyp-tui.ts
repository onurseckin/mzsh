import { closeSync, existsSync, openSync } from 'node:fs';
import process from 'node:process';
import { ReadStream as TtyReadStream, WriteStream as TtyWriteStream } from 'node:tty';
import {
  ANSI_CLEAR_SCREEN,
  ANSI_CURSOR_HIDE,
  ANSI_ENTER_ALT_SCREEN,
  registerTerminalSignalTraps,
  restoreTerminalState,
  sanitizeKeySequence,
  type TerminalInputStream,
  type TerminalOutputStream,
} from '../terminal-cleanup';
import {
  AGYP_TUI_KEY_HINTS,
  formatRow,
  formatScopeHeader,
  type AgypTuiRow,
} from './agyp-tui-render';

export type AgypTuiAction =
  | { kind: 'use'; email: string }
  | { kind: 'global'; email: string }
  | { kind: 'remove'; email: string }
  | { kind: 'login' }
  | { kind: 'refresh' }
  | { kind: 'cancel' };

export interface AgypTuiModel {
  rows: readonly AgypTuiRow[];
  sessionAccount: string | null;
  globalAccount: string | null;
  notice: string | null;
}

interface TtyHandles {
  input: TerminalInputStream;
  output: TerminalOutputStream;
  inputFd: number | null;
  outputFd: number | null;
}

function openTty(): TtyHandles | null {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    return { input: process.stdin, output: process.stdout, inputFd: null, outputFd: null };
  }
  // `agyp` is normally called from a shell function that captures stdout, so
  // the controlling terminal has to be reopened explicitly to drive the menu.
  if (!existsSync('/dev/tty')) {
    return null;
  }
  try {
    const inputFd = openSync('/dev/tty', 'r');
    const outputFd = openSync('/dev/tty', 'w');
    return {
      input: new TtyReadStream(inputFd),
      output: new TtyWriteStream(outputFd),
      inputFd,
      outputFd,
    };
  } catch {
    return null;
  }
}

export class AgypTui {
  public static isAvailable(): boolean {
    return (process.stdin.isTTY && process.stdout.isTTY) || existsSync('/dev/tty');
  }

  public static async present(model: AgypTuiModel): Promise<AgypTuiAction> {
    const handles = openTty();
    if (!handles) {
      return { kind: 'cancel' };
    }
    const { input, output, inputFd, outputFd } = handles;

    let selectedIndex = model.rows.findIndex((row) => row.isSession);
    if (selectedIndex === -1) {
      selectedIndex = model.rows.findIndex((row) => row.isGlobal);
    }
    if (selectedIndex === -1) {
      selectedIndex = 0;
    }

    const render = (): void => {
      const columns = output.columns ?? process.stdout.columns ?? 100;
      output.write(ANSI_CLEAR_SCREEN);
      output.write('\x1b[1;36mAntigravity accounts\x1b[0m\n\n');
      for (const line of formatScopeHeader(model.sessionAccount, model.globalAccount)) {
        output.write(`${line}\n`);
      }
      output.write('\n');

      if (model.rows.length === 0) {
        output.write('  \x1b[2;37mNo accounts yet. Press [n] to sign in to one.\x1b[0m\n');
      }
      model.rows.forEach((row, index) => {
        output.write(`${formatRow(row, index, index === selectedIndex, columns)}\n`);
      });

      if (model.notice !== null) {
        output.write(`\n  \x1b[33m${model.notice}\x1b[0m\n`);
      }
      output.write(`\n\x1b[2;37m${AGYP_TUI_KEY_HINTS}\x1b[0m\n`);
    };

    return new Promise<AgypTuiAction>((resolve) => {
      output.write(`${ANSI_ENTER_ALT_SCREEN}${ANSI_CURSOR_HIDE}`);
      if (typeof input.setRawMode === 'function') {
        try {
          input.setRawMode(true);
        } catch {
          // Not every stream honours raw mode; navigation still works.
        }
      }
      input.resume?.();
      render();

      let cleanedUp = false;
      let unregisterTraps: (() => void) | null = null;

      const cleanup = (): void => {
        if (cleanedUp) {
          return;
        }
        cleanedUp = true;
        unregisterTraps?.();
        unregisterTraps = null;
        input.removeListener?.('data', onData);
        restoreTerminalState({ input, output });
        if (inputFd !== null) {
          try {
            input.destroy?.();
            closeSync(inputFd);
          } catch {
            // Already closed.
          }
        }
        if (outputFd !== null) {
          try {
            output.destroy?.();
            closeSync(outputFd);
          } catch {
            // Already closed.
          }
        }
      };

      const finish = (action: AgypTuiAction): void => {
        cleanup();
        resolve(action);
      };

      unregisterTraps = registerTerminalSignalTraps({
        onSignal: () => finish({ kind: 'cancel' }),
        onResize: render,
        onCrash: () => finish({ kind: 'cancel' }),
        cleanup,
        input,
        output,
      });

      const selectedEmail = (): string | null => model.rows[selectedIndex]?.email ?? null;

      const onData = (chunk: unknown): void => {
        if (!Buffer.isBuffer(chunk)) {
          return;
        }
        try {
          for (const key of sanitizeKeySequence(chunk)) {
            if (key === '\x1b[A' || key === '\x1bOA' || key === 'k' || key === '\x10') {
              if (model.rows.length > 0) {
                selectedIndex = (selectedIndex - 1 + model.rows.length) % model.rows.length;
                render();
              }
            } else if (key === '\x1b[B' || key === '\x1bOB' || key === 'j' || key === '\x0e') {
              if (model.rows.length > 0) {
                selectedIndex = (selectedIndex + 1) % model.rows.length;
                render();
              }
            } else if (/^[1-9]$/.test(key)) {
              const target = Number.parseInt(key, 10) - 1;
              if (target < model.rows.length) {
                selectedIndex = target;
                render();
              }
            } else if (key === '\r' || key === '\n' || key === ' ') {
              const email = selectedEmail();
              finish(email === null ? { kind: 'cancel' } : { kind: 'use', email });
              return;
            } else if (key === 'g') {
              const email = selectedEmail();
              if (email !== null) {
                finish({ kind: 'global', email });
                return;
              }
            } else if (key === 'x') {
              const email = selectedEmail();
              if (email !== null) {
                finish({ kind: 'remove', email });
                return;
              }
            } else if (key === 'n') {
              finish({ kind: 'login' });
              return;
            } else if (key === 'r') {
              finish({ kind: 'refresh' });
              return;
            } else if (key === '\x1b' || key === 'q' || key === '\x03') {
              finish({ kind: 'cancel' });
              return;
            }
          }
        } catch {
          // A malformed escape sequence must never take the menu down.
        }
      };

      input.on?.('data', onData);
    });
  }
}
