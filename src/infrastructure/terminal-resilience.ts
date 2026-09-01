export type IsolationSignal = 'SIGINT' | 'SIGTERM' | 'SIGHUP' | 'SIGQUIT' | 'SIGWINCH';

export interface SignalTrapOptions {
  readonly forwardToChild?: boolean;
  readonly swallowInIdle?: boolean;
  readonly onSignal?: (signal: IsolationSignal) => void;
}

export type SessionResilienceState =
  | 'idle'
  | 'active'
  | 'interrupted'
  | 'reconnecting'
  | 'quiesced'
  | 'terminated';

export interface StreamBufferMetrics {
  readonly totalIngestedBytes: number;
  readonly totalDrainedBytes: number;
  readonly totalDroppedBytes: number;
  readonly peakBufferBytes: number;
  readonly currentBufferBytes: number;
  readonly burstCount: number;
}

export interface StreamBufferGuardOptions {
  readonly maxBufferSize?: number;
  readonly highWaterMark?: number;
  readonly lowWaterMark?: number;
  readonly burstThresholdBytesPerSec?: number;
  readonly onOverflow?: (droppedBytes: number) => void;
}

export interface ChildProcessTarget {
  readonly pid: number;
  readonly kill: (signal: NodeJS.Signals | number) => boolean;
}

export interface ProcessSignalIsolator {
  attach(): void;
  detach(): void;
  isAttached(): boolean;
  setActiveChild(child: ChildProcessTarget | undefined): void;
  getActiveChild(): ChildProcessTarget | undefined;
  setSessionState(state: SessionResilienceState): void;
  getSessionState(): SessionResilienceState;
}

export interface TerminalStreamBufferGuard {
  write(chunk: Uint8Array | string): boolean;
  read(maxBytes?: number): Uint8Array;
  drain(): Uint8Array;
  getMetrics(): StreamBufferMetrics;
  isBackpressureActive(): boolean;
  clear(): void;
}

export interface TerminalSessionWatchdogOptions {
  readonly heartbeatIntervalMs?: number;
  readonly maxInactivityMs?: number;
  readonly onStaleSession?: () => void;
}

const DEFAULT_SIGNALS: readonly IsolationSignal[] = [
  'SIGINT',
  'SIGTERM',
  'SIGHUP',
  'SIGQUIT',
  'SIGWINCH',
];

export class ProcessSignalIsolationHandler implements ProcessSignalIsolator {
  private attached = false;
  private activeChild: ChildProcessTarget | undefined;
  private sessionState: SessionResilienceState = 'idle';
  private readonly listeners = new Map<IsolationSignal, NodeJS.SignalsListener>();
  private readonly forwardToChild: boolean;
  private readonly swallowInIdle: boolean;
  private readonly onSignal: ((signal: IsolationSignal) => void) | undefined;

  constructor(options: SignalTrapOptions = {}) {
    const fwd = options.forwardToChild;
    const swl = options.swallowInIdle;
    this.forwardToChild = typeof fwd === 'boolean' ? fwd : true;
    this.swallowInIdle = typeof swl === 'boolean' ? swl : true;
    this.onSignal = options.onSignal;
  }

  attach(): void {
    if (this.attached) return;
    const emitter: NodeJS.EventEmitter = process;
    for (const signal of DEFAULT_SIGNALS) {
      const handler: NodeJS.SignalsListener = (): void => {
        this.handleSignal(signal);
      };
      this.listeners.set(signal, handler);
      emitter.addListener(signal, handler);
    }
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) return;
    const emitter: NodeJS.EventEmitter = process;
    for (const [signal, handler] of this.listeners.entries()) {
      emitter.removeListener(signal, handler);
    }
    this.listeners.clear();
    this.attached = false;
  }

  isAttached(): boolean {
    return this.attached;
  }
  setActiveChild(child: ChildProcessTarget | undefined): void {
    this.activeChild = child;
  }
  getActiveChild(): ChildProcessTarget | undefined {
    return this.activeChild;
  }
  setSessionState(state: SessionResilienceState): void {
    this.sessionState = state;
  }
  getSessionState(): SessionResilienceState {
    return this.sessionState;
  }

  private handleSignal(signal: IsolationSignal): void {
    if (this.onSignal !== undefined) this.onSignal(signal);
    if (this.activeChild !== undefined) {
      if (this.forwardToChild) {
        try {
          this.activeChild.kill(signal);
        } catch {
          // Process exited
        }
      }
      return;
    }
    if (this.sessionState === 'idle') {
      if (this.swallowInIdle) return;
    }
    if (signal === 'SIGINT') this.sessionState = 'interrupted';
  }
}

export class TerminalStreamBufferSafetyGuard implements TerminalStreamBufferGuard {
  private readonly maxBufferSize: number;
  private readonly highWaterMark: number;
  private readonly lowWaterMark: number;
  private readonly burstThresholdBytesPerSec: number;
  private readonly onOverflow: ((droppedBytes: number) => void) | undefined;
  private chunks: Uint8Array[] = [];
  private currentBytes = 0;
  private backpressureActive = false;
  private totalIngestedBytes = 0;
  private totalDrainedBytes = 0;
  private totalDroppedBytes = 0;
  private peakBufferBytes = 0;
  private burstCount = 0;
  private lastBurstSampleTimestamp = Date.now();
  private bytesSinceLastSample = 0;

  constructor(options: StreamBufferGuardOptions = {}) {
    const max = options.maxBufferSize;
    const high = options.highWaterMark;
    const low = options.lowWaterMark;
    const burst = options.burstThresholdBytesPerSec;
    this.maxBufferSize = typeof max === 'number' ? max : 1048576;
    this.highWaterMark = typeof high === 'number' ? high : 524288;
    this.lowWaterMark = typeof low === 'number' ? low : 131072;
    this.burstThresholdBytesPerSec = typeof burst === 'number' ? burst : 32768;
    this.onOverflow = options.onOverflow;
  }

  write(chunk: Uint8Array | string): boolean {
    const raw = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
    const len = raw.byteLength;
    if (len === 0) return !this.backpressureActive;

    this.checkBurstRate(len);
    this.totalIngestedBytes += len;

    if (this.currentBytes + len > this.maxBufferSize) {
      const requiredEviction = this.currentBytes + len - this.maxBufferSize;
      const dropped = this.evictOldest(requiredEviction);
      this.totalDroppedBytes += dropped;
      if (this.onOverflow !== undefined) this.onOverflow(dropped);
    }

    this.chunks.push(raw);
    this.currentBytes += len;
    if (this.currentBytes > this.peakBufferBytes) this.peakBufferBytes = this.currentBytes;
    if (this.currentBytes >= this.highWaterMark) this.backpressureActive = true;
    return !this.backpressureActive;
  }

  read(maxBytes?: number): Uint8Array {
    if (this.chunks.length === 0) return new Uint8Array(0);
    const limit = typeof maxBytes === 'number' ? maxBytes : this.currentBytes;
    if (limit <= 0) return new Uint8Array(0);

    let extracted = 0;
    const toConsume: Uint8Array[] = [];
    while (this.chunks.length > 0) {
      const head = this.chunks[0];
      if (head === undefined) break;
      const needed = limit - extracted;
      if (head.byteLength <= needed) {
        this.chunks.shift();
        toConsume.push(head);
        extracted += head.byteLength;
      } else {
        const sliceToTake = head.subarray(0, needed);
        this.chunks[0] = head.subarray(needed);
        toConsume.push(sliceToTake);
        extracted += sliceToTake.byteLength;
        break;
      }
    }

    this.currentBytes -= extracted;
    this.totalDrainedBytes += extracted;
    if (this.backpressureActive) {
      if (this.currentBytes <= this.lowWaterMark) this.backpressureActive = false;
    }
    return this.concatenate(toConsume, extracted);
  }

  drain(): Uint8Array {
    return this.read(this.currentBytes);
  }
  isBackpressureActive(): boolean {
    return this.backpressureActive;
  }

  getMetrics(): StreamBufferMetrics {
    return {
      totalIngestedBytes: this.totalIngestedBytes,
      totalDrainedBytes: this.totalDrainedBytes,
      totalDroppedBytes: this.totalDroppedBytes,
      peakBufferBytes: this.peakBufferBytes,
      currentBufferBytes: this.currentBytes,
      burstCount: this.burstCount,
    };
  }

  clear(): void {
    this.chunks = [];
    this.currentBytes = 0;
    this.backpressureActive = false;
  }

  private evictOldest(bytesToEvict: number): number {
    let evicted = 0;
    while (this.chunks.length > 0) {
      if (evicted >= bytesToEvict) break;
      const head = this.chunks[0];
      if (head === undefined) break;
      const needed = bytesToEvict - evicted;
      if (head.byteLength <= needed) {
        this.chunks.shift();
        evicted += head.byteLength;
      } else {
        this.chunks[0] = head.subarray(needed);
        evicted += needed;
        break;
      }
    }
    this.currentBytes -= evicted;
    return evicted;
  }

  private concatenate(chunks: readonly Uint8Array[], totalLength: number): Uint8Array {
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return combined;
  }

  private checkBurstRate(newBytes: number): void {
    const now = Date.now();
    const elapsed = now - this.lastBurstSampleTimestamp;
    if (elapsed >= 1000) {
      this.bytesSinceLastSample = newBytes;
      this.lastBurstSampleTimestamp = now;
      return;
    }
    this.bytesSinceLastSample += newBytes;
    const rate = (this.bytesSinceLastSample / Math.max(elapsed, 1)) * 1000;
    if (rate > this.burstThresholdBytesPerSec) this.burstCount += 1;
  }
}

export class TerminalSessionResilienceManager {
  private readonly isolator: ProcessSignalIsolator;
  private readonly bufferGuard: TerminalStreamBufferGuard;
  private readonly maxInactivityMs: number;
  private readonly onStaleSession: (() => void) | undefined;
  private lastActivityTimestamp = Date.now();
  private watchdogTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    options: {
      readonly signalOptions?: SignalTrapOptions;
      readonly bufferOptions?: StreamBufferGuardOptions;
      readonly watchdogOptions?: TerminalSessionWatchdogOptions;
    } = {}
  ) {
    this.isolator = new ProcessSignalIsolationHandler(options.signalOptions);
    this.bufferGuard = new TerminalStreamBufferSafetyGuard(options.bufferOptions);
    const watchdog = options.watchdogOptions;
    if (watchdog !== undefined) {
      const max = watchdog.maxInactivityMs;
      const interval = watchdog.heartbeatIntervalMs;
      this.maxInactivityMs = typeof max === 'number' ? max : 60000;
      this.onStaleSession = watchdog.onStaleSession;
      const intervalMs = typeof interval === 'number' ? interval : 5000;
      this.startWatchdog(intervalMs);
    } else {
      this.maxInactivityMs = 60000;
      this.onStaleSession = undefined;
    }
  }

  startSession(): void {
    this.isolator.attach();
    this.isolator.setSessionState('active');
    this.lastActivityTimestamp = Date.now();
  }

  pauseSession(): void {
    this.isolator.setSessionState('idle');
  }
  resumeSession(): void {
    this.isolator.setSessionState('active');
    this.lastActivityTimestamp = Date.now();
  }

  endSession(): void {
    this.isolator.setSessionState('terminated');
    this.isolator.detach();
    this.stopWatchdog();
  }

  recordActivity(): void {
    this.lastActivityTimestamp = Date.now();
  }
  getIsolator(): ProcessSignalIsolator {
    return this.isolator;
  }
  getBufferGuard(): TerminalStreamBufferGuard {
    return this.bufferGuard;
  }
  getState(): SessionResilienceState {
    return this.isolator.getSessionState();
  }

  private startWatchdog(intervalMs: number): void {
    this.stopWatchdog();
    this.watchdogTimer = setInterval(() => {
      this.checkStaleSession();
    }, intervalMs);
    if (typeof this.watchdogTimer.unref === 'function') {
      this.watchdogTimer.unref();
    }
  }

  private stopWatchdog(): void {
    if (this.watchdogTimer !== undefined) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = undefined;
    }
  }

  private checkStaleSession(): void {
    const elapsed = Date.now() - this.lastActivityTimestamp;
    if (elapsed > this.maxInactivityMs) {
      if (this.isolator.getSessionState() === 'active') {
        this.isolator.setSessionState('quiesced');
        if (this.onStaleSession !== undefined) {
          this.onStaleSession();
        }
      }
    }
  }
}
