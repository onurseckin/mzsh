/**
 * Interactive Menu Module for zshrc-manager
 */

import chalk from 'chalk';
import * as path from 'node:path';
import process from 'node:process';
import * as readline from 'node:readline';
import type { ZshFile } from './fileDiscovery';
import { type OpenType, openFileWithType } from './openConfig';
import {
  ANSI_CURSOR_SHOW,
  ANSI_RESET_FORMAT,
  registerTerminalSignalTraps,
  restoreTerminalState,
} from './infrastructure/terminal-cleanup';

export interface Choice {
  name: string;
  value: string;
  short: string;
}

export interface KeypressEvent {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  sequence?: string;
}

export interface PromptThemeStyle {
  answer?: typeof chalk.green;
  message?: typeof chalk.cyan;
  error?: typeof chalk.red;
  defaultAnswer?: typeof chalk.dim;
  help?: typeof chalk.dim;
  highlight?: typeof chalk.green.bold;
  key?: typeof chalk.cyan.bold;
}

export interface PromptTheme {
  style?: PromptThemeStyle;
}

export interface PromptInputStream extends NodeJS.ReadableStream {
  isTTY?: boolean;
  setRawMode?(mode: boolean): NodeJS.ReadStream | this;
}

export interface PromptOutputStream extends NodeJS.WritableStream {
  isTTY?: boolean;
  columns?: number;
  rows?: number;
}

export interface PromptOptions {
  message: string;
  choices: Choice[];
  pageSize?: number;
  input?: PromptInputStream;
  output?: PromptOutputStream;
  theme?: PromptTheme;
}

export class CustomListPrompt {
  private readonly input: PromptInputStream;
  private readonly output: PromptOutputStream;
  private readonly choices: readonly Choice[];
  private readonly message: string;
  private currentIndex = 0;
  private readonly pageSize: number;
  private readonly theme: PromptTheme;
  private rl: readline.Interface | null = null;
  private keypressListener: ((str: string, key: KeypressEvent | null) => void) | null = null;
  private unregisterSignalTraps: (() => void) | null = null;
  private isRawModeActive = false;
  private isCleanedUp = false;
  private linesRendered = 0;

  constructor(options: PromptOptions) {
    this.choices = options.choices ?? [];
    this.message = options.message ?? '';
    this.pageSize = options.pageSize ?? 10;
    this.theme = options.theme ?? {};
    this.input = options.input ?? process.stdin;
    this.output = options.output ?? process.stdout;
  }

  public getChoices(): readonly Choice[] {
    return this.choices;
  }
  public getCurrentIndex(): number {
    return this.currentIndex;
  }
  public isRawMode(): boolean {
    return this.isRawModeActive;
  }
  public isClean(): boolean {
    return this.isCleanedUp;
  }
  private isTTY(): boolean {
    return Boolean(this.input.isTTY && typeof this.input.setRawMode === 'function');
  }

  public async run(): Promise<string> {
    return this.isTTY() ? this.runTty() : this.runNonTty();
  }

  private async runTty(): Promise<string> {
    if (this.choices.length === 0) return '__quit__';
    try {
      this.rl = readline.createInterface({
        input: this.input,
        output: this.output,
        terminal: true,
      });
      readline.emitKeypressEvents(this.input, this.rl);
      if (typeof this.input.setRawMode === 'function') {
        this.input.setRawMode(true);
        this.isRawModeActive = true;
      }
      if (typeof this.input.resume === 'function') this.input.resume();
      this.render();

      return await new Promise<string>((resolve, reject) => {
        let settled = false;
        const finish = (v: string) => {
          if (settled) return;
          settled = true;
          this.cleanup();
          resolve(v);
        };
        const fail = (e: Error) => {
          if (settled) return;
          settled = true;
          this.cleanup();
          reject(e);
        };

        this.keypressListener = (_str: string, key: KeypressEvent | null) => {
          try {
            if (!key) return;
            if (
              key.name === 'escape' ||
              key.name === 'backspace' ||
              key.name === 'q' ||
              (Boolean(key.ctrl) && key.name === 'c')
            ) {
              finish('__quit__');
              return;
            }
            if (key.name === 'up' || key.name === 'k') {
              this.currentIndex = Math.max(0, this.currentIndex - 1);
              this.render();
            } else if (key.name === 'down' || key.name === 'j') {
              this.currentIndex = Math.min(this.choices.length - 1, this.currentIndex + 1);
              this.render();
            } else if (key.name && /^[1-9]$/.test(key.name)) {
              const numIdx = parseInt(key.name, 10) - 1;
              if (numIdx >= 0 && numIdx < this.choices.length) {
                this.currentIndex = numIdx;
                this.render();
              }
            } else if (key.name === 'return' || key.name === 'enter') {
              const selected = this.choices[this.currentIndex];
              if (selected) finish(selected.value);
            }
          } catch (err) {
            fail(err instanceof Error ? err : new Error(String(err)));
          }
        };

        this.unregisterSignalTraps = registerTerminalSignalTraps({
          onSignal: () => finish('__quit__'),
          onResize: () => this.render(),
          onCrash: (err) => fail(err instanceof Error ? err : new Error(String(err))),
          cleanup: () => this.cleanup(),
          input: this.input,
          output: this.output,
          rl: this.rl,
        });

        this.input.on('keypress', this.keypressListener);
      });
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  private async runNonTty(): Promise<string> {
    if (this.choices.length === 0) return '__quit__';
    const fallback =
      this.choices.find((c) => c.value !== '__quit__')?.value ??
      this.choices[0]?.value ??
      '__quit__';

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const finish = (v: string) => {
        if (settled) return;
        settled = true;
        this.cleanup();
        resolve(v);
      };
      const fail = (e: Error) => {
        if (settled) return;
        settled = true;
        this.cleanup();
        reject(e);
      };

      try {
        this.rl = readline.createInterface({
          input: this.input,
          output: this.output,
          terminal: false,
        });
        this.rl.once('line', (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return finish(fallback);
          if (trimmed === 'q' || trimmed === 'quit' || trimmed === 'exit')
            return finish('__quit__');
          const num = parseInt(trimmed, 10);
          if (!isNaN(num) && num >= 1 && num <= this.choices.length) {
            const selected = this.choices[num - 1];
            if (selected) return finish(selected.value);
          }
          const match = this.choices.find(
            (c) =>
              c.value === trimmed ||
              c.short.toLowerCase() === trimmed.toLowerCase() ||
              c.name.toLowerCase().includes(trimmed.toLowerCase())
          );
          finish(match ? match.value : fallback);
        });

        this.rl.once('close', () => finish(fallback));
        this.rl.once('error', (err: Error) => fail(err));
        this.input.once('error', (err: Error) => fail(err));
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private render(): void {
    if (!this.isTTY() || !this.output) return;
    try {
      const out = this.output as NodeJS.WriteStream;
      if (this.linesRendered > 0) {
        readline.cursorTo(out, 0);
        readline.clearScreenDown(out);
      }
      if (typeof out.write === 'function') out.write(`${this.message}\n`);
      const startIndex = Math.max(0, this.currentIndex - Math.floor(this.pageSize / 2));
      const endIndex = Math.min(this.choices.length, startIndex + this.pageSize);

      for (let i = startIndex; i < endIndex; i++) {
        const choice = this.choices[i];
        const isSelected = i === this.currentIndex;
        if (choice && typeof out.write === 'function') {
          out.write(`${isSelected ? chalk.green.bold(`> ${choice.name}`) : `  ${choice.name}`}\n`);
        }
      }
      this.linesRendered = 1 + (endIndex - startIndex);
      readline.moveCursor(out, 0, -this.linesRendered);
    } catch {}
  }

  public cleanup(): void {
    if (this.isCleanedUp) return;
    this.isCleanedUp = true;

    if (this.keypressListener) {
      this.input.removeListener('keypress', this.keypressListener);
      this.keypressListener = null;
    }
    if (this.unregisterSignalTraps) {
      this.unregisterSignalTraps();
      this.unregisterSignalTraps = null;
    }

    restoreTerminalState({
      input: this.input,
      output: this.output,
      rl: this.rl,
    });
    this.rl = null;
    this.isRawModeActive = false;

    if (
      this.isTTY() &&
      this.output &&
      typeof (this.output as NodeJS.WriteStream).write === 'function'
    ) {
      try {
        const out = this.output as NodeJS.WriteStream;
        readline.cursorTo(out, 0);
        readline.clearScreenDown(out);
        out.write(`${ANSI_CURSOR_SHOW}${ANSI_RESET_FORMAT}`);
      } catch {}
    }
  }
}

export class InteractiveMenu {
  constructor(
    private readonly exitHandler: (code: number) => void = (code) => process.exit(code),
    private readonly input?: PromptInputStream,
    private readonly output?: PromptOutputStream
  ) {}

  async showInteractiveMenu(files: ZshFile[], openType: OpenType): Promise<string | null> {
    const choices: Choice[] = files.map((file) => ({
      name: this.formatFileNameForMenu(file),
      value: file.path,
      short: file.name,
    }));
    choices.push({ name: chalk.red('✕ Quit'), value: '__quit__', short: 'Quit' });

    try {
      const customPrompt = new CustomListPrompt({
        message: chalk.cyan('Available zsh configuration files (ESC/Backspace/q/Ctrl+C to quit):'),
        choices,
        pageSize: Math.min(files.length + 3, 15),
        input: this.input,
        output: this.output,
      });

      const selectedFile = await customPrompt.run();
      if (selectedFile === '__quit__') {
        console.log(chalk.yellow('Operation cancelled.'));
        this.exitHandler(0);
        return null;
      }
      await this.openFile(selectedFile, openType);
      this.exitHandler(0);
      return selectedFile;
    } catch {
      console.log(chalk.yellow('\nOperation cancelled.'));
      this.exitHandler(0);
      return null;
    }
  }

  private formatFileNameForMenu(file: ZshFile): string {
    return `${chalk.yellow.bold('→ ')}${file.isZshrc ? chalk.green.bold(file.name) : chalk.blue(file.name)}`;
  }

  private formatFileName(file: ZshFile, isCurrent: boolean): string {
    const indicator = isCurrent ? chalk.yellow.bold('→ ') : '  ';
    const styled = isCurrent
      ? file.isZshrc
        ? chalk.green.bold.underline(file.name)
        : chalk.cyan.bold.underline(file.name)
      : file.isZshrc
        ? chalk.green(file.name)
        : chalk.blue(file.name);
    return `${indicator}${styled}`;
  }

  private async openFile(filePath: string, openType: OpenType): Promise<void> {
    console.log(chalk.gray(`Opening ${path.basename(filePath)}...`));
    try {
      await openFileWithType(
        filePath,
        openType,
        (message: string) => console.log(chalk.green(message)),
        (error: string) => {
          console.log(chalk.red(error));
          console.log(
            chalk.yellow('Tip: Make sure the application is installed and available in your PATH.')
          );
        }
      );
    } catch {}
  }
}
