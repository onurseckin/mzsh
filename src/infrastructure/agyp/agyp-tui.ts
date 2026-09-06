import { existsSync, openSync } from 'node:fs';
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

/** Actions that leave the menu; `present` resolves with one of these. */
export type AgypTuiAction = { kind: 'use'; email: string } | { kind: 'login' } | { kind: 'cancel' };

/** Actions served while the menu stays on screen. */
export type AgypTuiUpdate =
  | { kind: 'global'; email: string }
  | { kind: 'remove'; email: string }
  | { kind: 'refresh' };

export interface AgypTuiModel {
  rows: readonly AgypTuiRow[];
  sessionAccount: string | null;
  globalAccount: string | null;
  notice: string | null;
}

export interface AgypTuiController {
  /** Serves an in-menu action; the model it resolves replaces the one on screen. */
  update(action: AgypTuiUpdate): Promise<AgypTuiModel>;
}

export interface AgypTuiIo {
  input: TerminalInputStream;
  output: TerminalOutputStream;
  /** Releases whatever the streams hold; called exactly once when the menu closes. */
  close(): void;
}

const CANCEL_KEYS = new Set(['\x1b', 'q', '\x03']);
const UP_KEYS = new Set(['\x1b[A', '\x1bOA', 'k', '\x10']);
const DOWN_KEYS = new Set(['\x1b[B', '\x1bOB', 'j', '\x0e']);

function describeUpdate(action: AgypTuiUpdate): string {
  if (action.kind === 'refresh') {
    return 'Refreshing quota; accounts with no running agy get a short-lived probe...';
  }
  return action.kind === 'global'
    ? `Making ${action.email} the global default...`
    : `Removing ${action.email}...`;
}

function openTty(): AgypTuiIo | null {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    return {
      input: process.stdin,
      output: process.stdout,
      close: () => {},
    };
  }
  // `agyp` is normally called from a shell function that captures stdout, so
  // the controlling terminal has to be reopened explicitly to drive the menu.
  if (!existsSync('/dev/tty')) {
    return null;
  }
  try {
    const input = new TtyReadStream(openSync('/dev/tty', 'r'));
    const output = new TtyWriteStream(openSync('/dev/tty', 'w'));
    return {
      input,
      output,
      // The streams own their descriptors and release them on destroy. Closing
      // a descriptor by hand as well would make the stream's own deferred
      // close fail with EBADF, which surfaces as an uncaught error later.
      close: () => {
        input.destroy();
        output.destroy();
      },
    };
  } catch {
    return null;
  }
}

export class AgypTui {
  private readonly io: AgypTuiIo;
  private readonly controller: AgypTuiController;
  private model: AgypTuiModel;
  private selectedIndex: number;
  private busy = false;
  private finished = false;
  private unregisterTraps: (() => void) | null = null;
  private settle: ((action: AgypTuiAction) => void) | null = null;

  private constructor(io: AgypTuiIo, model: AgypTuiModel, controller: AgypTuiController) {
    this.io = io;
    this.controller = controller;
    this.model = model;
    this.selectedIndex = AgypTui.defaultIndex(model);
  }

  public static isAvailable(): boolean {
    return (process.stdin.isTTY && process.stdout.isTTY) || existsSync('/dev/tty');
  }

  /**
   * Shows the menu until the user picks an action that leaves it. In-menu
   * actions go through `controller` and redraw in place, so the terminal is
   * opened once and the cursor stays where the user left it.
   */
  public static present(
    model: AgypTuiModel,
    controller: AgypTuiController,
    io?: AgypTuiIo
  ): Promise<AgypTuiAction> {
    const handles = io ?? openTty();
    if (!handles) {
      return Promise.resolve({ kind: 'cancel' });
    }
    return new AgypTui(handles, model, controller).run();
  }

  private static defaultIndex(model: AgypTuiModel): number {
    const session = model.rows.findIndex((row) => row.isSession);
    if (session !== -1) {
      return session;
    }
    const global = model.rows.findIndex((row) => row.isGlobal);
    return global === -1 ? 0 : global;
  }

  private run(): Promise<AgypTuiAction> {
    const { input, output } = this.io;
    return new Promise<AgypTuiAction>((resolve) => {
      this.settle = resolve;
      output.write(`${ANSI_ENTER_ALT_SCREEN}${ANSI_CURSOR_HIDE}`);
      if (typeof input.setRawMode === 'function') {
        try {
          input.setRawMode(true);
        } catch {
          // Not every stream honours raw mode; navigation still works.
        }
      }
      input.resume?.();
      this.render();

      this.unregisterTraps = registerTerminalSignalTraps({
        onSignal: () => this.finish({ kind: 'cancel' }),
        onResize: () => this.render(),
        onCrash: () => this.finish({ kind: 'cancel' }),
        cleanup: () => this.cleanup(),
        input,
        output,
      });
      input.on?.('data', this.onData);
      input.on?.('error', this.onStreamError);
      output.on?.('error', this.onStreamError);
    });
  }

  private readonly onStreamError = (): void => {
    // A terminal that went away cannot show the menu any more; leave quietly
    // rather than letting the stream error take the whole process down.
    this.finish({ kind: 'cancel' });
  };

  private readonly onData = (chunk: unknown): void => {
    if (!Buffer.isBuffer(chunk)) {
      return;
    }
    try {
      for (const key of sanitizeKeySequence(chunk)) {
        this.handleKey(key);
        if (this.finished) {
          return;
        }
      }
    } catch {
      // A malformed escape sequence must never take the menu down.
    }
  };

  private selectedEmail(): string | null {
    return this.model.rows[this.selectedIndex]?.email ?? null;
  }

  private handleKey(key: string): void {
    const count = this.model.rows.length;
    if (CANCEL_KEYS.has(key)) {
      this.finish({ kind: 'cancel' });
    } else if (UP_KEYS.has(key)) {
      if (count > 0) {
        this.selectedIndex = (this.selectedIndex - 1 + count) % count;
        this.render();
      }
    } else if (DOWN_KEYS.has(key)) {
      if (count > 0) {
        this.selectedIndex = (this.selectedIndex + 1) % count;
        this.render();
      }
    } else if (/^[1-9]$/.test(key)) {
      const target = Number.parseInt(key, 10) - 1;
      if (target < count) {
        this.selectedIndex = target;
        this.render();
      }
    } else if (!this.busy) {
      this.handleActionKey(key);
    }
  }

  /** Keys that act on the menu; ignored while an update is in flight. */
  private handleActionKey(key: string): void {
    const email = this.selectedEmail();
    if (key === '\r' || key === '\n' || key === ' ') {
      this.finish(email === null ? { kind: 'cancel' } : { kind: 'use', email });
    } else if (key === 'n') {
      this.finish({ kind: 'login' });
    } else if (key === 'r') {
      void this.applyUpdate({ kind: 'refresh' });
    } else if (key === 'g' && email !== null) {
      void this.applyUpdate({ kind: 'global', email });
    } else if (key === 'x' && email !== null) {
      void this.applyUpdate({ kind: 'remove', email });
    }
  }

  private async applyUpdate(action: AgypTuiUpdate): Promise<void> {
    this.busy = true;
    this.model = { ...this.model, notice: describeUpdate(action) };
    this.render();
    let next: AgypTuiModel;
    try {
      next = await this.controller.update(action);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      next = { ...this.model, notice: `${action.kind} failed: ${message}` };
    }
    this.busy = false;
    // The user may have quit while the update ran; the terminal is gone then.
    if (this.finished) {
      return;
    }
    this.replaceModel(next);
    this.render();
  }

  /** Swaps the model in while keeping the cursor on the same account. */
  private replaceModel(next: AgypTuiModel): void {
    const previous = this.selectedEmail();
    this.model = next;
    const kept = previous === null ? -1 : next.rows.findIndex((row) => row.email === previous);
    this.selectedIndex = kept === -1 ? AgypTui.defaultIndex(next) : kept;
    if (this.selectedIndex >= next.rows.length) {
      this.selectedIndex = Math.max(0, next.rows.length - 1);
    }
  }

  private render(): void {
    if (this.finished) {
      return;
    }
    const { output } = this.io;
    const { model } = this;
    // A terminal with no window size yet reports 0 columns; treat it as unknown.
    const columns = [output.columns, process.stdout.columns].find((width) => width) ?? 100;
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
      output.write(`${formatRow(row, index, index === this.selectedIndex, columns)}\n`);
    });

    if (model.notice !== null) {
      output.write(`\n  \x1b[33m${model.notice}\x1b[0m\n`);
    }
    output.write(`\n\x1b[2;37m${AGYP_TUI_KEY_HINTS}\x1b[0m\n`);
  }

  /** Idempotent: a signal trap may have torn the terminal down already. */
  private finish(action: AgypTuiAction): void {
    this.cleanup();
    const settle = this.settle;
    this.settle = null;
    settle?.(action);
  }

  private cleanup(): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    const { input, output } = this.io;
    this.unregisterTraps?.();
    this.unregisterTraps = null;
    input.removeListener?.('data', this.onData);
    input.removeListener?.('error', this.onStreamError);
    output.removeListener?.('error', this.onStreamError);
    restoreTerminalState({ input, output });
    try {
      this.io.close();
    } catch {
      // Nothing left to release.
    }
  }
}
