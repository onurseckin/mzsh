import { Readable, Writable } from 'node:stream';
import type { QuotaSnapshot } from '../../../src/domain/agyp/agyp-types';
import type {
  AgypTuiController,
  AgypTuiIo,
  AgypTuiModel,
  AgypTuiUpdate,
} from '../../../src/infrastructure/agyp/agyp-tui';
import type { AgypTuiRow } from '../../../src/infrastructure/agyp/agyp-tui-render';

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, 'g');

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

export function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

export class FakeInput extends Readable {
  public isTTY = true;
  public rawMode = false;

  override _read(): void {}

  public setRawMode(mode: boolean): this {
    this.rawMode = mode;
    return this;
  }

  public async press(key: string): Promise<void> {
    this.push(Buffer.from(key));
    await tick();
  }
}

export class FakeOutput extends Writable {
  public isTTY = true;
  public columns = 100;
  public frames: string[] = [];

  override _write(chunk: unknown, _encoding: BufferEncoding, callback: () => void): void {
    this.frames.push(String(chunk));
    callback();
  }

  /** Everything drawn since the last clear-screen, without escape codes. */
  public screen(): string {
    const joined = this.frames.join('');
    const lastClear = joined.lastIndexOf('\x1b[2J');
    return stripAnsi(lastClear === -1 ? joined : joined.slice(lastClear));
  }
}

export interface FakeIo extends AgypTuiIo {
  input: FakeInput;
  output: FakeOutput;
  closeCalls: number;
}

export function fakeIo(): FakeIo {
  const io: FakeIo = {
    input: new FakeInput(),
    output: new FakeOutput(),
    closeCalls: 0,
    close: () => {
      io.closeCalls += 1;
    },
  };
  return io;
}

export function snapshot(email: string, remaining: number): QuotaSnapshot {
  return {
    email,
    planName: 'Pro',
    gemini: { remainingPercentage: remaining, resetTime: null, modelCount: 11 },
    capturedAt: '2026-09-06T15:00:00Z',
    source: 'live_session',
  };
}

export function row(email: string, remaining: number, flags: Partial<AgypTuiRow> = {}): AgypTuiRow {
  return {
    email,
    snapshot: snapshot(email, remaining),
    liveSessionCount: 0,
    isSession: false,
    isGlobal: false,
    ...flags,
  };
}

export function modelOf(rows: AgypTuiRow[], notice: string | null = null): AgypTuiModel {
  return {
    rows,
    sessionAccount: rows.find((entry) => entry.isSession)?.email ?? null,
    globalAccount: rows.find((entry) => entry.isGlobal)?.email ?? null,
    notice,
  };
}

/** A controller whose answers the test hands out one at a time. */
export class ScriptedController implements AgypTuiController {
  public received: AgypTuiUpdate[] = [];
  private pending: ((model: AgypTuiModel) => void) | null = null;
  private failing: ((error: Error) => void) | null = null;

  public update(action: AgypTuiUpdate): Promise<AgypTuiModel> {
    this.received.push(action);
    return new Promise((resolve, reject) => {
      this.pending = resolve;
      this.failing = reject;
    });
  }

  public get inFlight(): boolean {
    return this.pending !== null;
  }

  public async answer(model: AgypTuiModel): Promise<void> {
    const resolve = this.pending;
    this.pending = null;
    this.failing = null;
    resolve?.(model);
    await tick();
  }

  public async fail(message: string): Promise<void> {
    const reject = this.failing;
    this.pending = null;
    this.failing = null;
    reject?.(new Error(message));
    await tick();
  }
}

/** Resolves to the menu's answer, and reports whether it has answered yet. */
export function track<T>(promise: Promise<T>): { settled: () => boolean; value: () => Promise<T> } {
  let done = false;
  const tracked = promise.then((value) => {
    done = true;
    return value;
  });
  return { settled: () => done, value: () => tracked };
}
