import process from 'node:process';
import type * as readline from 'node:readline';

export const ANSI_CURSOR_SHOW = '\x1b[?25h';
export const ANSI_CURSOR_HIDE = '\x1b[?25l';
export const ANSI_ENTER_ALT_SCREEN = '\x1b[?1049h';
export const ANSI_EXIT_ALT_SCREEN = '\x1b[?1049l';
export const ANSI_RESET_FORMAT = '\x1b[0m';
export const ANSI_CLEAR_SCREEN = '\x1b[2J\x1b[H';
export const ANSI_RESTORE_TERMINAL = '\x1b[?25h\x1b[?1049l\x1b[0m';

export interface TerminalInputStream {
  isTTY?: boolean;
  setRawMode?(mode: boolean): unknown;
  pause?(): unknown;
  resume?(): unknown;
  destroy?(): void;
  on?(event: string, listener: (...args: unknown[]) => void): this;
  removeListener?(event: string, listener: (...args: unknown[]) => void): this;
}

export interface TerminalOutputStream {
  isTTY?: boolean;
  columns?: number;
  rows?: number;
  write(buffer: string | Uint8Array): boolean;
  destroy?(): void;
}

export interface TerminalRestoreOptions {
  readonly input?: TerminalInputStream | null;
  readonly output?: TerminalOutputStream | null;
  readonly rl?: readline.Interface | null;
  readonly clearAlternateScreen?: boolean;
}

export function restoreTerminalState(options: TerminalRestoreOptions = {}): void {
  const input = options.input;
  const output = options.output;
  const rl = options.rl;

  if (rl !== null && rl !== undefined) {
    try {
      rl.close();
    } catch {
      // Ignored
    }
  }

  if (input !== null && input !== undefined) {
    if (typeof input.setRawMode === 'function') {
      try {
        input.setRawMode(false);
      } catch {
        // Ignored
      }
    }
    if (typeof input.pause === 'function') {
      try {
        input.pause();
      } catch {
        // Ignored
      }
    }
  }

  const isTtyOut =
    output !== undefined && output !== null
      ? (output.isTTY ?? true)
      : Boolean(process.stdout?.isTTY);

  if (!isTtyOut && !options.clearAlternateScreen) {
    return;
  }

  const restoreSeq = options.clearAlternateScreen
    ? `${ANSI_RESTORE_TERMINAL}${ANSI_CLEAR_SCREEN}`
    : ANSI_RESTORE_TERMINAL;

  if (output !== null && output !== undefined && typeof output.write === 'function') {
    try {
      output.write(restoreSeq);
    } catch {
      // Ignored
    }
  } else if (typeof process.stdout?.write === 'function') {
    try {
      process.stdout.write(restoreSeq);
    } catch {
      // Ignored
    }
  }
}

export interface SignalTrapRegistrationOptions {
  readonly onSignal?: (signal: 'SIGINT' | 'SIGTERM' | 'SIGHUP' | 'SIGQUIT') => void;
  readonly onResize?: () => void;
  readonly onCrash?: (error: unknown) => void;
  readonly cleanup?: () => void;
  readonly input?: TerminalInputStream | null;
  readonly output?: TerminalOutputStream | null;
  readonly rl?: readline.Interface | null;
  readonly exitOnSignal?: boolean;
  readonly exitCodeOnSignal?: number;
}

export function isInteractiveTty(
  input?: TerminalInputStream | null,
  output?: TerminalOutputStream | null
): boolean {
  const inTty = input ? Boolean(input.isTTY) : Boolean(process.stdin?.isTTY);
  const outTty = output ? Boolean(output.isTTY) : Boolean(process.stdout?.isTTY);
  return inTty && outTty;
}

export function isPipedOrBackground(
  input?: TerminalInputStream | null,
  output?: TerminalOutputStream | null
): boolean {
  return !isInteractiveTty(input, output);
}

export function registerTerminalSignalTraps(options: SignalTrapRegistrationOptions): () => void {
  let cleanedUp = false;

  const performCleanup = (): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      if (options.cleanup) {
        options.cleanup();
      }
    } catch {
      // Ignore cleanup error
    }
    restoreTerminalState({
      input: options.input,
      output: options.output,
      rl: options.rl,
    });
  };

  const handleTermination = (signal: 'SIGINT' | 'SIGTERM' | 'SIGHUP' | 'SIGQUIT'): void => {
    performCleanup();
    if (options.onSignal) {
      try {
        options.onSignal(signal);
      } catch {
        // Ignored
      }
    }
    if (options.exitOnSignal) {
      const code = options.exitCodeOnSignal !== undefined ? options.exitCodeOnSignal : 0;
      process.exit(code);
    }
  };

  const sigintHandler = (): void => handleTermination('SIGINT');
  const sigtermHandler = (): void => handleTermination('SIGTERM');
  const sighupHandler = (): void => handleTermination('SIGHUP');
  const sigquitHandler = (): void => handleTermination('SIGQUIT');
  const exitHandler = (): void => performCleanup();

  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  const sigwinchHandler = (): void => {
    if (!options.onResize) return;
    if (resizeTimer !== undefined) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(() => {
      try {
        if (!cleanedUp && options.onResize) {
          options.onResize();
        }
      } catch {
        // Prevent resize callback exception from crashing
      }
    }, 16);
  };

  const uncaughtExceptionHandler = (err: unknown): void => {
    performCleanup();
    if (options.onCrash) {
      try {
        options.onCrash(err);
      } catch {
        // Ignored
      }
    } else {
      const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
      try {
        process.stderr.write(`\nUncaught Error: ${msg}\n`);
      } catch {
        // Ignored
      }
    }
  };

  const unhandledRejectionHandler = (reason: unknown): void => {
    performCleanup();
    if (options.onCrash) {
      try {
        options.onCrash(reason);
      } catch {
        // Ignored
      }
    } else {
      const msg = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
      try {
        process.stderr.write(`\nUnhandled Rejection: ${msg}\n`);
      } catch {
        // Ignored
      }
    }
  };

  const emitter: NodeJS.EventEmitter = process;

  emitter.on('SIGINT', sigintHandler);
  emitter.on('SIGTERM', sigtermHandler);
  emitter.on('SIGHUP', sighupHandler);
  emitter.on('SIGQUIT', sigquitHandler);
  emitter.on('SIGWINCH', sigwinchHandler);
  emitter.on('exit', exitHandler);
  emitter.on('uncaughtException', uncaughtExceptionHandler);
  emitter.on('unhandledRejection', unhandledRejectionHandler);

  return (): void => {
    if (resizeTimer !== undefined) {
      clearTimeout(resizeTimer);
      resizeTimer = undefined;
    }
    emitter.removeListener('SIGINT', sigintHandler);
    emitter.removeListener('SIGTERM', sigtermHandler);
    emitter.removeListener('SIGHUP', sighupHandler);
    emitter.removeListener('SIGQUIT', sigquitHandler);
    emitter.removeListener('SIGWINCH', sigwinchHandler);
    emitter.removeListener('exit', exitHandler);
    emitter.removeListener('uncaughtException', uncaughtExceptionHandler);
    emitter.removeListener('unhandledRejection', unhandledRejectionHandler);
  };
}

export function sanitizeKeySequence(raw: string | Buffer): readonly string[] {
  const str = typeof raw === 'string' ? raw : raw.toString('utf-8');
  if (str.length === 0) return [];

  const ESC = String.fromCharCode(0x1b);

  // Ignore mouse tracking sequences (SGR mouse mode \x1b[<...M or \x1b[<...m, X10 mouse mode \x1b[M...)
  if (
    (str.startsWith(`${ESC}[<`) && /^\d+;\d+;\d+[Mm]/.test(str.slice(3))) ||
    (str.startsWith(`${ESC}[M`) && str.length >= 6)
  ) {
    return [];
  }

  // Bracketed paste sequences (\x1b[200~ ... \x1b[201~)
  if (str.includes(`${ESC}[200~`)) {
    const cleaned = str.replaceAll(`${ESC}[200~`, '').replaceAll(`${ESC}[201~`, '');
    return cleaned.length > 0 ? [cleaned] : [];
  }

  // Break concatenated known ANSI escape sequences or multi-key bursts
  const sequences: string[] = [];
  let i = 0;
  while (i < str.length) {
    if (str[i] === ESC) {
      if (i + 1 < str.length && str[i + 1] === '[') {
        // CSI sequence: ESC [ <params> <final byte (0x40-0x7e)>
        let j = i + 2;
        while (j < str.length) {
          const code = str.charCodeAt(j);
          if (code >= 0x40 && code <= 0x7e) {
            j++;
            break;
          }
          j++;
        }
        sequences.push(str.slice(i, j));
        i = j;
      } else if (i + 1 < str.length && str[i + 1] === 'O') {
        // SS3 sequence: ESC O <final byte>
        const end = Math.min(str.length, i + 3);
        sequences.push(str.slice(i, end));
        i = end;
      } else {
        // 2-byte escape
        const end = Math.min(str.length, i + 2);
        sequences.push(str.slice(i, end));
        i = end;
      }
    } else {
      sequences.push(str[i]!);
      i++;
    }
  }

  return sequences.length > 0 ? sequences : [str];
}
