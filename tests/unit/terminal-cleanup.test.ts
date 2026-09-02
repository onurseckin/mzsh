import { describe, expect, it } from 'bun:test';
import { Readable, Writable } from 'node:stream';
import process from 'node:process';
import {
  ANSI_CLEAR_SCREEN,
  ANSI_CURSOR_HIDE,
  ANSI_CURSOR_SHOW,
  ANSI_ENTER_ALT_SCREEN,
  ANSI_EXIT_ALT_SCREEN,
  ANSI_RESET_FORMAT,
  ANSI_RESTORE_TERMINAL,
  isInteractiveTty,
  isPipedOrBackground,
  registerTerminalSignalTraps,
  restoreTerminalState,
  sanitizeKeySequence,
  type TerminalInputStream,
  type TerminalOutputStream,
} from '../../src/infrastructure/terminal-cleanup';

class TestInputStream extends Readable implements TerminalInputStream {
  public isTTY = true;
  public rawMode = true;
  public paused = false;

  override _read(): void {}

  public setRawMode(mode: boolean): this {
    this.rawMode = mode;
    return this;
  }

  override pause(): this {
    this.paused = true;
    return super.pause();
  }
}

class TestOutputStream extends Writable implements TerminalOutputStream {
  public isTTY = true;
  public columns = 100;
  public rows = 30;
  public written: string[] = [];

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    this.written.push(chunk.toString());
    callback();
  }
}

describe('terminal-cleanup resilience module', () => {
  it('exposes standard ANSI escape sequences for terminal control', () => {
    expect(ANSI_CURSOR_SHOW).toBe('\x1b[?25h');
    expect(ANSI_CURSOR_HIDE).toBe('\x1b[?25l');
    expect(ANSI_ENTER_ALT_SCREEN).toBe('\x1b[?1049h');
    expect(ANSI_EXIT_ALT_SCREEN).toBe('\x1b[?1049l');
    expect(ANSI_RESET_FORMAT).toBe('\x1b[0m');
    expect(ANSI_CLEAR_SCREEN).toBe('\x1b[2J\x1b[H');
    expect(ANSI_RESTORE_TERMINAL).toBe('\x1b[?25h\x1b[?1049l\x1b[0m');
  });

  it('restores raw mode, pauses stream, and emits restore sequence unconditionally', () => {
    const input = new TestInputStream();
    const output = new TestOutputStream();
    let rlClosed = false;
    const mockRl = {
      close: () => {
        rlClosed = true;
      },
    } as unknown as import('node:readline').Interface;

    restoreTerminalState({ input, output, rl: mockRl });

    expect(input.rawMode).toBe(false);
    expect(input.paused).toBe(true);
    expect(rlClosed).toBe(true);
    expect(output.written.join('')).toContain(ANSI_RESTORE_TERMINAL);
  });

  it('handles null and undefined streams without throwing during restoration', () => {
    expect(() => restoreTerminalState({})).not.toThrow();
    expect(() =>
      restoreTerminalState({
        input: null,
        output: null,
        rl: null,
      })
    ).not.toThrow();
  });

  it('correctly classifies interactive TTY vs piped/background streams', () => {
    const ttyIn = new TestInputStream();
    const ttyOut = new TestOutputStream();
    ttyIn.isTTY = true;
    ttyOut.isTTY = true;
    expect(isInteractiveTty(ttyIn, ttyOut)).toBe(true);
    expect(isPipedOrBackground(ttyIn, ttyOut)).toBe(false);

    const nonTtyIn = new TestInputStream();
    nonTtyIn.isTTY = false;
    expect(isInteractiveTty(nonTtyIn, ttyOut)).toBe(false);
    expect(isPipedOrBackground(nonTtyIn, ttyOut)).toBe(true);
  });

  it('registers signal traps and dispatches onSignal, onResize, and cleanup', async () => {
    let signalCaptured = '';
    let cleanedUp = false;
    let resized = false;
    const input = new TestInputStream();
    const output = new TestOutputStream();

    const unregister = registerTerminalSignalTraps({
      onSignal: (sig) => {
        signalCaptured = sig;
      },
      onResize: () => {
        resized = true;
      },
      cleanup: () => {
        cleanedUp = true;
      },
      input,
      output,
    });

    (process as NodeJS.EventEmitter).emit('SIGWINCH');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(resized).toBe(true);

    (process as NodeJS.EventEmitter).emit('SIGINT');
    expect(signalCaptured).toBe('SIGINT');
    expect(cleanedUp).toBe(true);
    expect(input.rawMode).toBe(false);

    unregister();
  });

  it('unregisters all listeners cleanly without leaking', () => {
    const emitter: NodeJS.EventEmitter = process;
    const countBefore = emitter.listenerCount('SIGTERM');

    const unregister = registerTerminalSignalTraps({});
    expect(emitter.listenerCount('SIGTERM')).toBe(countBefore + 1);

    unregister();
    expect(emitter.listenerCount('SIGTERM')).toBe(countBefore);
  });

  it('sanitizes rapid key bursts, touch input, and bracketed paste', () => {
    // Single keys
    expect(sanitizeKeySequence('q')).toEqual(['q']);
    expect(sanitizeKeySequence('\x1b[A')).toEqual(['\x1b[A']);

    // Concatenated burst (e.g. Up + Down + Return)
    const burst = '\x1b[A\x1b[B\r';
    expect(sanitizeKeySequence(burst)).toEqual(['\x1b[A', '\x1b[B', '\r']);

    // Mouse tracking / touch gesture codes (should be ignored / filtered out)
    expect(sanitizeKeySequence('\x1b[<35;10;20M')).toEqual([]);
    expect(sanitizeKeySequence('\x1b[<0;5;12m')).toEqual([]);
    expect(sanitizeKeySequence('\x1b[M #$')).toEqual([]);

    // Bracketed paste
    const pasted = '\x1b[200~.zshrc\x1b[201~';
    expect(sanitizeKeySequence(pasted)).toEqual(['.zshrc']);

    // Empty
    expect(sanitizeKeySequence('')).toEqual([]);
  });
});
