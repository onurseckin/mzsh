import { describe, expect, it } from 'bun:test';
import { Readable, Writable } from 'node:stream';
import process from 'node:process';
import {
  type Choice,
  CustomListPrompt,
  InteractiveMenu,
  type KeypressEvent,
} from '../../src/interactiveMenu';
import type { ZshFile } from '../../src/fileDiscovery';

class MockReadStream extends Readable {
  public isTTY: boolean;
  public rawMode = false;
  public paused = false;
  public resumed = false;

  constructor(isTTY = true) {
    super();
    this.isTTY = isTTY;
  }

  override _read(): void {}

  public setRawMode(mode: boolean): this {
    this.rawMode = mode;
    return this;
  }

  override pause(): this {
    this.paused = true;
    return super.pause();
  }

  override resume(): this {
    this.resumed = true;
    return super.resume();
  }
}

class MockWriteStream extends Writable {
  public isTTY: boolean;
  public columns = 80;
  public rows = 24;
  public output: string[] = [];

  constructor(isTTY = true) {
    super();
    this.isTTY = isTTY;
  }

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    this.output.push(chunk.toString());
    callback();
  }
}

const sampleChoices: readonly Choice[] = [
  { name: '.zshrc', value: '/home/user/.zshrc', short: '.zshrc' },
  { name: '.zprofile', value: '/home/user/.zprofile', short: '.zprofile' },
  { name: '.zshenv', value: '/home/user/.zshenv', short: '.zshenv' },
  { name: 'Quit', value: '__quit__', short: 'Quit' },
];

const sampleFiles: ZshFile[] = [
  {
    name: '.zshrc',
    path: '/home/user/.zshrc',
    isZshrc: true,
    size: 1024,
    lastModified: new Date('2026-01-01'),
  },
  {
    name: '.zprofile',
    path: '/home/user/.zprofile',
    isZshrc: false,
    size: 512,
    lastModified: new Date('2026-01-01'),
  },
];

describe('CustomListPrompt - TTY Mode', () => {
  it('enters raw mode and enables keypress handling on TTY stream', async () => {
    const input = new MockReadStream(true);
    const output = new MockWriteStream(true);
    const prompt = new CustomListPrompt({
      message: 'Select:',
      choices: [...sampleChoices],
      input,
      output,
    });

    const runPromise = prompt.run();
    expect(input.rawMode).toBe(true);
    expect(input.resumed).toBe(true);
    expect(prompt.isRawMode()).toBe(true);

    input.emit('keypress', '\r', { name: 'return' } as KeypressEvent);
    const result = await runPromise;
    expect(result).toBe('/home/user/.zshrc');
    expect(input.rawMode).toBe(false);
    expect(input.paused).toBe(true);
    expect(prompt.isClean()).toBe(true);
  });

  it('navigates down and up using arrow keys, vim keys, and index clamps', async () => {
    const input = new MockReadStream(true);
    const output = new MockWriteStream(true);
    const prompt = new CustomListPrompt({
      message: 'Select:',
      choices: [...sampleChoices],
      input,
      output,
    });

    const runPromise = prompt.run();
    expect(prompt.getCurrentIndex()).toBe(0);

    input.emit('keypress', '', { name: 'down' } as KeypressEvent);
    expect(prompt.getCurrentIndex()).toBe(1);

    input.emit('keypress', 'j', { name: 'j' } as KeypressEvent);
    expect(prompt.getCurrentIndex()).toBe(2);

    input.emit('keypress', '', { name: 'up' } as KeypressEvent);
    expect(prompt.getCurrentIndex()).toBe(1);

    input.emit('keypress', 'k', { name: 'k' } as KeypressEvent);
    expect(prompt.getCurrentIndex()).toBe(0);

    input.emit('keypress', 'k', { name: 'k' } as KeypressEvent);
    expect(prompt.getCurrentIndex()).toBe(0);

    input.emit('keypress', '\r', { name: 'enter' } as KeypressEvent);
    const result = await runPromise;
    expect(result).toBe('/home/user/.zshrc');
  });

  it('supports numeric key jumps and quit key cancellations', async () => {
    const cancelKeys: KeypressEvent[] = [
      { name: 'escape' },
      { name: 'backspace' },
      { name: 'q' },
      { name: 'c', ctrl: true },
    ];

    for (const key of cancelKeys) {
      const input = new MockReadStream(true);
      const output = new MockWriteStream(true);
      const prompt = new CustomListPrompt({
        message: 'Select:',
        choices: [...sampleChoices],
        input,
        output,
      });
      const runPromise = prompt.run();

      input.emit('keypress', '3', { name: '3' } as KeypressEvent);
      expect(prompt.getCurrentIndex()).toBe(2);

      input.emit('keypress', key.name ?? '', key);
      const result = await runPromise;
      expect(result).toBe('__quit__');
      expect(input.rawMode).toBe(false);
      expect(input.paused).toBe(true);
    }
  });

  it('handles unexpected ANSI sequences, touch bursts, and unknown keys gracefully', async () => {
    const input = new MockReadStream(true);
    const output = new MockWriteStream(true);
    const prompt = new CustomListPrompt({
      message: 'Select:',
      choices: [...sampleChoices],
      input,
      output,
    });
    const runPromise = prompt.run();

    // Unexpected / touch sequences
    input.emit('keypress', '\x1b[<35;20;10M', { sequence: '\x1b[<35;20;10M' } as KeypressEvent);
    input.emit('keypress', 'F24', { name: 'f24' } as KeypressEvent);
    input.emit('keypress', '99', { name: '99' } as KeypressEvent); // Out of bounds numeric
    expect(prompt.getCurrentIndex()).toBe(0);

    input.emit('keypress', '2', { name: '2' } as KeypressEvent);
    expect(prompt.getCurrentIndex()).toBe(1);

    input.emit('keypress', '\r', { name: 'return' } as KeypressEvent);
    const result = await runPromise;
    expect(result).toBe('/home/user/.zprofile');
    expect(prompt.isClean()).toBe(true);
  });

  it('traps SIGINT, SIGTERM, SIGHUP, and window resize SIGWINCH gracefully', async () => {
    const signals: ('SIGINT' | 'SIGTERM' | 'SIGHUP')[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

    for (const sig of signals) {
      const input = new MockReadStream(true);
      const output = new MockWriteStream(true);
      const prompt = new CustomListPrompt({
        message: 'Select:',
        choices: [...sampleChoices],
        input,
        output,
      });
      const runPromise = prompt.run();

      // Trigger SIGWINCH resize during prompt
      (process as NodeJS.EventEmitter).emit('SIGWINCH');

      // Trigger termination signal
      (process as NodeJS.EventEmitter).emit(sig);
      const result = await runPromise;
      expect(result).toBe('__quit__');
      expect(prompt.isClean()).toBe(true);
      expect(input.rawMode).toBe(false);
    }
  });

  it('removes ONLY its own keypress listener on cleanup', async () => {
    const input = new MockReadStream(true);
    const output = new MockWriteStream(true);
    let externalInvoked = 0;
    const external = () => {
      externalInvoked += 1;
    };
    input.on('keypress', external);

    const prompt = new CustomListPrompt({
      message: 'Select:',
      choices: [...sampleChoices],
      input,
      output,
    });
    const runPromise = prompt.run();

    input.emit('keypress', '\r', { name: 'return' } as KeypressEvent);
    await runPromise;
    expect(prompt.isClean()).toBe(true);

    input.emit('keypress', 'a', { name: 'a' } as KeypressEvent);
    expect(externalInvoked).toBe(2);
    input.removeListener('keypress', external);
  });

  it('handles empty choices cleanly in TTY mode', async () => {
    const input = new MockReadStream(true);
    const output = new MockWriteStream(true);
    const prompt = new CustomListPrompt({ message: 'Empty:', choices: [], input, output });
    expect(await prompt.run()).toBe('__quit__');
  });
});

describe('CustomListPrompt - Non-TTY & Piped Fallback', () => {
  it('falls back gracefully on non-TTY piped numerical and named choices', async () => {
    const input = new MockReadStream(false);
    const output = new MockWriteStream(false);
    const prompt = new CustomListPrompt({
      message: 'Select:',
      choices: [...sampleChoices],
      input,
      output,
    });
    const runPromise = prompt.run();

    expect(input.rawMode).toBe(false);
    prompt['rl']?.emit('line', '2');
    expect(await runPromise).toBe('/home/user/.zprofile');
    expect(prompt.isClean()).toBe(true);
  });

  it('handles exact choice matches, empty EOF close, and quit lines in non-TTY', async () => {
    const input1 = new MockReadStream(false);
    const prompt1 = new CustomListPrompt({
      message: 'Select:',
      choices: [...sampleChoices],
      input: input1,
      output: new MockWriteStream(false),
    });
    const run1 = prompt1.run();
    prompt1['rl']?.emit('line', '.zshenv');
    expect(await run1).toBe('/home/user/.zshenv');

    const input2 = new MockReadStream(false);
    const prompt2 = new CustomListPrompt({
      message: 'Select:',
      choices: [...sampleChoices],
      input: input2,
      output: new MockWriteStream(false),
    });
    const run2 = prompt2.run();
    prompt2['rl']?.emit('close');
    expect(await run2).toBe('/home/user/.zshrc');

    const input3 = new MockReadStream(false);
    const prompt3 = new CustomListPrompt({
      message: 'Select:',
      choices: [...sampleChoices],
      input: input3,
      output: new MockWriteStream(false),
    });
    const run3 = prompt3.run();
    prompt3['rl']?.emit('line', 'quit');
    expect(await run3).toBe('__quit__');
  });

  it('handles empty choices in non-TTY mode immediately', async () => {
    const prompt = new CustomListPrompt({
      message: 'Empty:',
      choices: [],
      input: new MockReadStream(false),
      output: new MockWriteStream(false),
    });
    expect(await prompt.run()).toBe('__quit__');
  });
});

describe('InteractiveMenu Integration & Error Handling', () => {
  it('handles quit selection without terminating process via injected exitHandler', async () => {
    let capturedExitCode: number | null = null;
    const exitHandler = (code: number) => {
      capturedExitCode = code;
    };
    const input = new MockReadStream(true);
    const menu = new InteractiveMenu(exitHandler, input, new MockWriteStream(true));
    const menuPromise = menu.showInteractiveMenu(sampleFiles, 'default');

    input.emit('keypress', 'q', { name: 'q' } as KeypressEvent);
    expect(await menuPromise).toBeNull();
    expect(capturedExitCode).toBe(0);
  });

  it('formats file names correctly for .zshrc and other files', () => {
    const menu = new InteractiveMenu();
    expect(menu['formatFileNameForMenu'](sampleFiles[0]!)).toContain('.zshrc');
    expect(menu['formatFileNameForMenu'](sampleFiles[1]!)).toContain('.zprofile');
    expect(menu['formatFileName'](sampleFiles[0]!, true)).toContain('.zshrc');
    expect(menu['formatFileName'](sampleFiles[1]!, false)).toContain('.zprofile');
  });

  it('handles stream error gracefully and cleans up', async () => {
    const input = new MockReadStream(false);
    const prompt = new CustomListPrompt({
      message: 'Select:',
      choices: [...sampleChoices],
      input,
      output: new MockWriteStream(false),
    });
    const runPromise = prompt.run();

    input.emit('error', new Error('STREAM_FAILURE'));
    await expect(runPromise).rejects.toThrow('STREAM_FAILURE');
    expect(prompt.isClean()).toBe(true);
  });
});
