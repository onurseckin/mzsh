import { afterEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dir, '../..');
const modulesRoot = join(repositoryRoot, 'portable', 'zsh', 'modules');
const fixtureParent = join(repositoryRoot, 'tests', '.fixtures');
const fixtures: string[] = [];
const zshPath = Bun.which('zsh');

if (zshPath === null) throw new Error('portable Zsh behavior tests require zsh');

function fixture(): string {
  mkdirSync(fixtureParent, { recursive: true });
  const root = mkdtempSync(join(fixtureParent, 'portable-live-'));
  fixtures.push(root);
  return root;
}

function runInteractive(
  root: string,
  script: string,
  extraEnvironment: Record<string, string> = {}
): ReturnType<typeof Bun.spawnSync> {
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  return Bun.spawnSync([zshPath, '-dfi', '-c', script], {
    cwd: root,
    env: {
      HOME: home,
      PATH: `${join(root, 'bin')}:/usr/bin:/bin:/usr/sbin:/sbin`,
      XDG_CACHE_HOME: join(root, 'cache'),
      ...extraEnvironment,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function output(result: ReturnType<typeof Bun.spawnSync>): string {
  if (!(result.stdout instanceof Uint8Array)) throw new Error('expected standard output');
  return new TextDecoder().decode(result.stdout);
}

function errors(result: ReturnType<typeof Bun.spawnSync>): string {
  if (!(result.stderr instanceof Uint8Array)) throw new Error('expected standard error');
  return new TextDecoder().decode(result.stderr);
}

afterEach(() =>
  fixtures.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
);

describe('portable interactive behavior modules', () => {
  test('keeps interactive-only definitions out of a noninteractive shell', () => {
    const root = fixture();
    const result = Bun.spawnSync(
      [
        zshPath,
        '-df',
        '-c',
        [
          `source ${JSON.stringify(join(modulesRoot, 'aliases.zsh'))}`,
          `source ${JSON.stringify(join(modulesRoot, 'history.zsh'))}`,
          `source ${JSON.stringify(join(modulesRoot, 'ports-manager.zsh'))}`,
          `source ${JSON.stringify(join(modulesRoot, 'oh-my-zsh.zsh'))}`,
          'print -r -- "DEFINITIONS=${+functions[n]}:${+functions[history-cleaner]}:${+functions[kk]}:${MZSH_OH_MY_ZSH_LOADED:-absent}"',
        ].join('\n'),
      ],
      {
        cwd: root,
        env: { HOME: join(root, 'home'), PATH: '/usr/bin:/bin' },
        stdout: 'pipe',
        stderr: 'pipe',
      }
    );

    expect(result.exitCode).toBe(0);
    expect(errors(result)).toBe('');
    expect(output(result)).toBe('DEFINITIONS=0:0:0:absent\n');
  });

  test('defines prompt, aliases, search, and history behavior quietly only in an interactive shell', () => {
    const root = fixture();
    const script = [
      `source ${JSON.stringify(join(modulesRoot, 'prompt-vi.zsh'))}`,
      `source ${JSON.stringify(join(modulesRoot, 'aliases.zsh'))}`,
      `source ${JSON.stringify(join(modulesRoot, 'search.zsh'))}`,
      `source ${JSON.stringify(join(modulesRoot, 'history.zsh'))}`,
      `source ${JSON.stringify(join(modulesRoot, 'history.zsh'))}`,
      'print -r -- "VI=$ZVM_INIT_MODE:${+functions[zvm_after_init]}"',
      'print -r -- "ALIASES=${aliases[rm]}:${aliases[tldrconfig]}"',
      'print -r -- "FUNCTIONS=${+functions[n]}:${+functions[history-cleaner]}:${+functions[history-reload]}"',
      'print -r -- "FZF=${FZF_DEFAULT_COMMAND}"',
      'print -r -- "HOOKS=${precmd_functions[(I)_mzsh_history_cleaner_precmd_hook]}"',
      'print -r -- "HISTORY=$HISTFILE:$HISTSIZE:$SAVEHIST:${options[sharehistory]}"',
    ].join('\n');

    const result = runInteractive(root, script);

    expect(result.exitCode).toBe(0);
    expect(errors(result)).toBe('');
    expect(output(result)).toContain('VI=sourcing:1\n');
    expect(output(result)).toContain(
      'ALIASES=rmtrash:nvim "$HOME/Library/Application Support/tealdeer/config.toml"\n'
    );
    expect(output(result)).toContain('FUNCTIONS=1:1:1\n');
    expect(output(result)).toContain('FZF=rg --files --hidden --follow');
    expect(output(result)).toContain('HOOKS=1\n');
    expect(output(result)).toContain('HISTORY=');
    expect(output(result)).toContain(':10000:10000:on\n');
  });

  test('keeps framework loading optional while preparing vi configuration before a present framework', () => {
    const root = fixture();
    const framework = join(root, 'home', '.oh-my-zsh');
    mkdirSync(join(framework, 'themes', 'powerlevel10k'), { recursive: true });
    mkdirSync(join(framework, 'plugins', 'zsh-vi-mode'), { recursive: true });
    writeFileSync(
      join(framework, 'plugins', 'zsh-vi-mode', 'zsh-vi-mode.plugin.zsh'),
      'return 0\n'
    );
    writeFileSync(
      join(framework, 'themes', 'powerlevel10k', 'powerlevel10k.zsh-theme'),
      'return 0\n'
    );
    writeFileSync(
      join(framework, 'oh-my-zsh.sh'),
      'print -r -- "FRAMEWORK=$ZVM_INIT_MODE:$ZSH_THEME:${plugins[(I)zsh-vi-mode]}"\n'
    );

    const present = runInteractive(
      root,
      [
        `source ${JSON.stringify(join(modulesRoot, 'oh-my-zsh.zsh'))}`,
        'print -r -- "LOADED=${MZSH_OH_MY_ZSH_LOADED:-absent}"',
      ].join('\n')
    );
    const absent = runInteractive(
      fixture(),
      `source ${JSON.stringify(join(modulesRoot, 'oh-my-zsh.zsh'))}`
    );

    expect(present.exitCode).toBe(0);
    expect(errors(present)).toBe('');
    expect(output(present)).toContain('FRAMEWORK=sourcing:powerlevel10k/powerlevel10k:1\n');
    expect(output(present)).toContain('LOADED=1\n');
    expect(absent.exitCode).toBe(0);
    expect(errors(absent)).toBe('');
  });

  test('discovers requested plugins across core and custom paths, honoring user overrides and skipping empty directories', () => {
    const root = fixture();
    const framework = join(root, 'custom-omz');
    const customDir = join(root, 'custom-dir');
    // Core plugins with entrypoints
    mkdirSync(join(framework, 'plugins', 'git'), { recursive: true });
    writeFileSync(join(framework, 'plugins', 'git', 'git.plugin.zsh'), 'return 0\n');
    mkdirSync(join(framework, 'plugins', 'fzf'), { recursive: true });
    writeFileSync(join(framework, 'plugins', 'fzf', 'fzf.plugin.zsh'), 'return 0\n');
    mkdirSync(join(framework, 'plugins', 'zsh-vi-mode'), { recursive: true });
    writeFileSync(
      join(framework, 'plugins', 'zsh-vi-mode', 'zsh-vi-mode.plugin.zsh'),
      'return 0\n'
    );
    // Core empty directory without entrypoint (should be skipped)
    mkdirSync(join(framework, 'plugins', 'aliases'), { recursive: true });

    // Custom plugins with entrypoints (including custom user plugin and duplicate git)
    mkdirSync(join(customDir, 'plugins', 'git'), { recursive: true });
    writeFileSync(join(customDir, 'plugins', 'git', 'git.plugin.zsh'), 'return 0\n');
    mkdirSync(join(customDir, 'plugins', 'user-tool'), { recursive: true });
    writeFileSync(join(customDir, 'plugins', 'user-tool', 'user-tool.zsh'), 'return 0\n');
    mkdirSync(join(customDir, 'plugins', 'zsh-autosuggestions'), { recursive: true });
    writeFileSync(
      join(customDir, 'plugins', 'zsh-autosuggestions', 'zsh-autosuggestions.zsh'),
      'return 0\n'
    );
    mkdirSync(join(customDir, 'plugins', 'zsh-syntax-highlighting'), { recursive: true });
    writeFileSync(
      join(customDir, 'plugins', 'zsh-syntax-highlighting', 'zsh-syntax-highlighting.plugin.zsh'),
      'return 0\n'
    );
    mkdirSync(join(customDir, 'plugins', 'fzf-tab'), { recursive: true });
    writeFileSync(join(customDir, 'plugins', 'fzf-tab', '_fzf-tab'), '#compdef fzf-tab\n');
    // Custom empty directory without entrypoint (should be skipped)
    mkdirSync(join(customDir, 'plugins', 'aws'), { recursive: true });

    writeFileSync(
      join(framework, 'oh-my-zsh.sh'),
      'print -r -- "EXACT_PLUGINS=${(j:,:)plugins}"\n'
    );

    const result = runInteractive(
      root,
      [
        'plugins=(user-tool git)',
        `source ${JSON.stringify(join(modulesRoot, 'oh-my-zsh.zsh'))}`,
        'print -r -- "LOADED=${MZSH_OH_MY_ZSH_LOADED:-absent}"',
      ].join('\n'),
      {
        MZSH_OH_MY_ZSH_ROOT: framework,
        ZSH_CUSTOM: customDir,
      }
    );

    expect(result.exitCode).toBe(0);
    expect(errors(result)).toBe('');
    expect(output(result)).toContain(
      'EXACT_PLUGINS=user-tool,git,fzf,fzf-tab,zsh-autosuggestions,zsh-syntax-highlighting,zsh-vi-mode\n'
    );
    expect(output(result)).not.toContain('aliases');
    expect(output(result)).not.toContain('aws');
    expect(output(result)).toContain('LOADED=1\n');
  });

  test('resolves custom and core themes, handling subdirectories and empty theme fallback', () => {
    const root = fixture();
    const framework = join(root, 'omz');
    const customDir = join(root, 'custom');
    mkdirSync(join(framework, 'themes', 'nested-core'), { recursive: true });
    writeFileSync(join(framework, 'themes', 'nested-core', 'nested-core.zsh-theme'), 'return 0\n');
    mkdirSync(join(customDir, 'themes'), { recursive: true });
    writeFileSync(join(customDir, 'themes', 'custom-flat.zsh-theme'), 'return 0\n');
    writeFileSync(
      join(framework, 'oh-my-zsh.sh'),
      'print -r -- "RESOLVED_THEME=$ZSH_THEME"\nprint -r -- "ZSH_CACHE_DIR=$ZSH_CACHE_DIR"\nprint -r -- "ZSH_COMPDUMP=$ZSH_COMPDUMP"\n'
    );

    const flatResult = runInteractive(
      root,
      `source ${JSON.stringify(join(modulesRoot, 'oh-my-zsh.zsh'))}`,
      {
        MZSH_OH_MY_ZSH_ROOT: framework,
        ZSH_CUSTOM: customDir,
        MZSH_OH_MY_ZSH_THEME: 'custom-flat',
      }
    );
    expect(flatResult.exitCode).toBe(0);
    expect(errors(flatResult)).toBe('');
    expect(output(flatResult)).toContain('RESOLVED_THEME=custom-flat\n');
    expect(output(flatResult)).toContain(`ZSH_CACHE_DIR=${join(root, 'cache', 'mzsh')}\n`);

    const missingResult = runInteractive(
      root,
      `source ${JSON.stringify(join(modulesRoot, 'oh-my-zsh.zsh'))}`,
      {
        MZSH_OH_MY_ZSH_ROOT: framework,
        ZSH_CUSTOM: customDir,
        MZSH_OH_MY_ZSH_THEME: 'nonexistent-theme',
      }
    );
    expect(missingResult.exitCode).toBe(0);
    expect(errors(missingResult)).toBe('');
    expect(output(missingResult)).toContain('RESOLVED_THEME=\n');
  });

  test('binds vi-mode insert and command keys and reap alias in interactive shell', () => {
    const root = fixture();
    const script = [
      `source ${JSON.stringify(join(modulesRoot, 'prompt-vi.zsh'))}`,
      `source ${JSON.stringify(join(modulesRoot, 'aliases.zsh'))}`,
      'zvm_after_init',
      'print -r -- "VIINS_A=$(bindkey -M viins "^A")"',
      'print -r -- "VIINS_E=$(bindkey -M viins "^E")"',
      'print -r -- "VICMD_U=$(bindkey -M vicmd "u")"',
      'print -r -- "REAP_ALIAS=${aliases[reap]}"',
    ].join('\n');

    const result = runInteractive(root, script);

    expect(result.exitCode).toBe(0);
    expect(errors(result)).toBe('');
    expect(output(result)).toContain('VIINS_A="^A" beginning-of-line\n');
    expect(output(result)).toContain('VIINS_E="^E" end-of-line\n');
    expect(output(result)).toContain('VICMD_U="u" undo\n');
    expect(output(result)).toContain('REAP_ALIAS=reap-zombies\n');
  });

  test('loads opt-in static fzf bindings and completion without evaluating command output', () => {
    const root = fixture();
    const fzfShell = join(root, 'fzf-shell');
    mkdirSync(fzfShell, { recursive: true });
    writeFileSync(join(fzfShell, 'key-bindings.zsh'), 'typeset -g MZSH_FZF_BINDINGS=loaded\n');
    writeFileSync(join(fzfShell, 'completion.zsh'), 'typeset -g MZSH_FZF_COMPLETION=loaded\n');

    const result = runInteractive(
      root,
      [
        `source ${JSON.stringify(join(modulesRoot, 'search.zsh'))}`,
        'print -r -- "FZF=${MZSH_FZF_BINDINGS:-absent}:${MZSH_FZF_COMPLETION:-absent}"',
      ].join('\n'),
      { MZSH_FZF_SHELL_DIR: fzfShell }
    );

    expect(result.exitCode).toBe(0);
    expect(errors(result)).toBe('');
    expect(output(result)).toBe('FZF=loaded:loaded\n');
  });

  test('redacts database passwords and performs no port action until validated helpers are called', () => {
    const root = fixture();
    const bin = join(root, 'bin');
    mkdirSync(bin, { recursive: true });
    const calls = join(root, 'calls');
    writeFileSync(
      join(bin, 'lsof'),
      `#!/bin/zsh\nprint -r -- "$*" >> ${JSON.stringify(calls)}\nprint -r -- 4242\n`
    );
    const killRunner = join(bin, 'kill-runner');
    writeFileSync(killRunner, `#!/bin/zsh\nprint -r -- "$*" >> ${JSON.stringify(calls)}\n`);
    chmodSync(join(bin, 'lsof'), 0o755);
    chmodSync(killRunner, 0o755);

    const result = runInteractive(
      root,
      [
        `source ${JSON.stringify(join(modulesRoot, 'dburl.zsh'))}`,
        `source ${JSON.stringify(join(modulesRoot, 'ports-manager.zsh'))}`,
        'print -r -- "FUNCTIONS=${+functions[dburl]}:${+functions[kk]}:${+functions[kka]}"',
        'dburl "postgres://reader:example-password@localhost:5432/app?password=query-secret&pwd=short-secret&%70assword=encoded-secret&sslmode=require"',
        'kk invalid; print -r -- "INVALID=$?"',
        'kk 3000; print -r -- "VALID=$?"',
      ].join('\n'),
      { MZSH_PORTS_KILL_RUNNER: killRunner }
    );

    expect(result.exitCode).toBe(0);
    expect(output(result)).toContain('FUNCTIONS=1:1:1\n');
    expect(output(result)).toContain('password: [redacted]\n');
    expect(output(result)).toContain('password: [redacted]\n');
    expect(output(result)).not.toContain('example-password');
    expect(output(result)).not.toContain('query-secret');
    expect(output(result)).not.toContain('short-secret');
    expect(output(result)).not.toContain('encoded-secret');
    expect(output(result)).toContain('INVALID=1\n');
    expect(output(result)).toContain('VALID=0\n');
    expect(readFileSync(calls, 'utf8')).toContain('-nP -ti :3000');
    expect(readFileSync(calls, 'utf8')).toContain('-- 4242');
  });
});
