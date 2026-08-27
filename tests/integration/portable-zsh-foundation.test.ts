import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PORTABLE_INTERACTIVE_MODULE_ORDER } from '../../src/domain/portable-module-order';
import * as helpers from './portable-zsh-test-helpers';

const {
  zshPath,
  portableEnvironment,
  createFixture,
  makeDirectory,
  copyPortableRoot,
  injectBoundaryFailure,
  outputOf,
  errorOutputOf,
} = helpers;
afterEach(helpers.cleanupFixtures);

describe('portable Zsh initialization', () => {
  test('clears initialization state after a failed manifest so a corrected retry succeeds', () => {
    const fixture = createFixture();
    const portableRoot = copyPortableRoot(fixture);
    const manifestPath = join(portableRoot, 'manifest.zsh');
    writeFileSync(
      manifestPath,
      `if [[ \${MZSH_TEST_FAIL_MANIFEST:-} == 1 ]]; then\n  return 1\nfi\n${readFileSync(manifestPath, 'utf8')}`
    );
    makeDirectory(fixture, 'home');
    makeDirectory(fixture, 'system');

    const script = [
      'function compinit() { return 0 }',
      'MZSH_TEST_FAIL_MANIFEST=1',
      'source "$MZSH_ENTRYPOINT"; first_status=$?',
      'print -r -- "FIRST=$first_status"',
      'print -r -- "AFTER_FAILURE=${MZSH_PORTABLE_ZSH_INITIALIZED:-absent}"',
      'unset MZSH_TEST_FAIL_MANIFEST',
      'source "$MZSH_ENTRYPOINT"; second_status=$?',
      'print -r -- "SECOND=$second_status"',
      'print -r -- "AFTER_RETRY=${MZSH_PORTABLE_ZSH_INITIALIZED:-absent}"',
      'print -r -- "MODULES=${MZSH_LOADED_MODULES:-absent}"',
    ].join('\n');

    const result = Bun.spawnSync([zshPath, '-fic', script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, 'home'),
        PATH: `${join(fixture, 'system')}:/usr/bin:/bin`,
        FPATH: '',
        MZSH_ENTRYPOINT: join(portableRoot, 'init.zsh'),
        BUN_INSTALL: '',
        NVM_DIR: '',
        CARGO_HOME: join(fixture, 'missing-cargo'),
        ANDROID_HOME: '',
        ANDROID_SDK_ROOT: '',
        MZSH_OH_MY_ZSH_ROOT: '',
        MZSH_DOCKER_COMPLETION_DIR: '',
        MZSH_PRIVATE_ZSH: join(fixture, 'missing-private.zsh'),
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(0);
    expect(outputOf(result)).toContain('FIRST=1\n');
    expect(outputOf(result)).toContain('AFTER_FAILURE=absent\n');
    expect(outputOf(result)).toContain('SECOND=0\n');
    expect(outputOf(result)).toContain('AFTER_RETRY=1\n');
    expect(outputOf(result)).not.toContain('MODULES=absent\n');
  });

  test('restores MZSH-owned state after failures at path, framework, and completion boundaries', () => {
    for (const failureBoundary of ['path', 'oh-my-zsh', 'completion'] as const) {
      const fixture = createFixture();
      const portableRoot = copyPortableRoot(fixture);
      const failureVariable = injectBoundaryFailure(portableRoot, failureBoundary);
      makeDirectory(fixture, 'home');
      makeDirectory(fixture, 'system');
      const frameworkRoot = makeDirectory(fixture, 'oh-my-zsh');
      writeFileSync(
        join(frameworkRoot, 'oh-my-zsh.sh'),
        'typeset -g THIRD_PARTY_FRAMEWORK_MARKER=1\n'
      );

      const script = [
        'function compinit() { return 0 }',
        'source "$MZSH_ENTRYPOINT"; first_status=$?',
        'print -r -- "FIRST=$first_status"',
        'print -r -- "BOUNDARY_EXECUTED=${MZSH_TEST_BOUNDARY_EXECUTED:-absent}"',
        'print -r -- "PATH_AFTER_FAILURE=$PATH"',
        'print -r -- "FPATH_AFTER_FAILURE=${(j:,:)fpath}"',
        'print -r -- "TRACE_AFTER_FAILURE=${+parameters[MZSH_LOADED_MODULES]}"',
        'print -r -- "VERSION_AFTER_FAILURE=${+parameters[MZSH_PORTABLE_ZSH_VERSION]}"',
        'print -r -- "OWNER_AFTER_FAILURE=${+parameters[MZSH_COMPLETION_OWNER]}"',
        'print -r -- "PATH_HELPER_AFTER_FAILURE=${+functions[mzsh_path_finalize]}"',
        'print -r -- "OBSERVE_HELPER_AFTER_FAILURE=${+functions[mzsh_observe]}"',
        `unset ${failureVariable}`,
        'source "$MZSH_ENTRYPOINT"; second_status=$?',
        'print -r -- "SECOND=$second_status"',
        'print -r -- "RETRY_TRACE=${(j:,:)MZSH_LOADED_MODULES}"',
      ].join('\n');
      const shellFlags = failureBoundary === 'oh-my-zsh' ? '-fic' : '-fc';
      const result = Bun.spawnSync([zshPath, shellFlags, script], {
        cwd: fixture,
        env: {
          ...portableEnvironment(),
          HOME: join(fixture, 'home'),
          PATH: `${join(fixture, 'system')}:/usr/bin:/bin`,
          FPATH: '',
          MZSH_ENTRYPOINT: join(portableRoot, 'init.zsh'),
          [failureVariable]: '1',
          MZSH_OH_MY_ZSH_ROOT: frameworkRoot,
          BUN_INSTALL: '',
          NVM_DIR: '',
          CARGO_HOME: join(fixture, 'missing-cargo'),
          ANDROID_HOME: '',
          ANDROID_SDK_ROOT: '',
          MZSH_PRIVATE_ZSH: join(fixture, 'missing-private.zsh'),
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const output = outputOf(result);
      expect(result.exitCode).toBe(0);
      expect(errorOutputOf(result)).toBe('');
      expect(output).toContain('FIRST=1\n');
      expect(output).toContain(`BOUNDARY_EXECUTED=${failureBoundary}\n`);
      expect(output).toContain(`PATH_AFTER_FAILURE=${join(fixture, 'system')}:/usr/bin:/bin\n`);
      expect(output).toContain('FPATH_AFTER_FAILURE=\n');
      expect(output).toContain('TRACE_AFTER_FAILURE=0\n');
      expect(output).toContain('VERSION_AFTER_FAILURE=0\n');
      expect(output).toContain('OWNER_AFTER_FAILURE=0\n');
      expect(output).toContain('PATH_HELPER_AFTER_FAILURE=0\n');
      expect(output).toContain('OBSERVE_HELPER_AFTER_FAILURE=0\n');
      expect(output).toContain('SECOND=0\n');
      expect(output).toContain(`RETRY_TRACE=${PORTABLE_INTERACTIVE_MODULE_ORDER.join(',')}\n`);
    }
  });

  test('restores prior interactive definitions after a post-framework private failure and permits a corrected retry', () => {
    const fixture = createFixture();
    const portableRoot = copyPortableRoot(fixture);
    const failureVariable = injectBoundaryFailure(portableRoot, 'private');
    makeDirectory(fixture, 'home');
    makeDirectory(fixture, 'system');
    const frameworkRoot = makeDirectory(fixture, 'oh-my-zsh');
    writeFileSync(join(frameworkRoot, 'oh-my-zsh.sh'), 'return 0\n');
    const scalarReplaySentinel = join(fixture, 'scalar-replay-sentinel');
    const arrayReplaySentinel = join(fixture, 'array-replay-sentinel');
    const policyReplaySentinel = join(fixture, 'policy-replay-sentinel');
    const hostileScalar = `$(touch ${scalarReplaySentinel}) ; original-history-search`;
    const hostileArrayValue = `$(touch ${arrayReplaySentinel})`;
    const hostilePolicy = `original-policy; $(touch ${policyReplaySentinel})`;

    const script = [
      'function compinit() { return 0 }',
      'function n() { print -r -- original-n }',
      'function dburl() { print -r -- original-dburl }',
      'function user_precmd() { return 0 }',
      'alias rm=original-rm',
      `precmd_functions=(user_precmd '${hostileArrayValue}')`,
      `plugins=(original-plugin '${hostileArrayValue}')`,
      'export ZSH=original-zsh ZSH_THEME=original-theme ZSH_TMUX_CONFIG=original-tmux',
      'export FZF_DEFAULT_COMMAND=original-fzf',
      'unset FZF_DEFAULT_OPTS',
      `export FZF_CTRL_R_OPTS='${hostileScalar}'`,
      `MZSH_NVM_POLICY='${hostilePolicy}'`,
      "zstyle ':completion:*:descriptions' format 'existing description' 'second description'",
      "zstyle ':fzf-tab:*' switch-group '[' ']'",
      "zstyle ':omz:plugins:ssh-agent' identities original_rsa original_ed25519",
      "zstyle ':omz:plugins:ssh-agent' lifetime original-lifetime",
      'unsetopt append_history share_history hist_save_no_dups',
      'setopt inc_append_history hist_ignore_dups hist_ignore_space',
      `export ${failureVariable}=1`,
      'source "$MZSH_ENTRYPOINT"; first_status=$?',
      'print -r -- "FIRST=$first_status"',
      'print -r -- "RESTORED=${aliases[rm]}:${+functions[n]}:${+functions[dburl]}:$ZSH:$ZSH_THEME:$ZSH_TMUX_CONFIG:$FZF_DEFAULT_COMMAND"',
      'print -r -- "ARRAYS_RESTORED=${(j:,:)precmd_functions}:${(j:,:)plugins}"',
      'print -r -- "FZF_HISTORY_RESTORED=$FZF_CTRL_R_OPTS"',
      'print -r -- "SCALAR_TYPES=${parameters[FZF_CTRL_R_OPTS]}:${parameters[MZSH_NVM_POLICY]}"',
      'print -r -- "ABSENT_SCALARS=${+parameters[MZSH_COMPLETION_OWNER]}:${+parameters[FZF_DEFAULT_OPTS]}"',
      'print -r -- "ABSENT_ARRAYS=${+parameters[MZSH_LOADED_MODULES]}:${+parameters[MZSH_PATH_SHIMS]}:${+parameters[MZSH_PATH_APPLICATIONS]}"',
      'print -r -- "SIDE_EFFECTS=$([[ -e $MZSH_TEST_SCALAR_SENTINEL ]] && print present || print absent):$([[ -e $MZSH_TEST_ARRAY_SENTINEL ]] && print present || print absent):$([[ -e $MZSH_TEST_POLICY_SENTINEL ]] && print present || print absent)"',
      'function print_style() { local label=$1 context=$2 name=$3; local -a values; if zstyle -L "$context" "$name" >/dev/null 2>&1; then zstyle -a "$context" "$name" values; print -r -- "STYLE_${label}=present:${(j:,:)values}"; else print -r -- "STYLE_${label}=absent"; fi }',
      "print_style omz-identities ':omz:plugins:ssh-agent' identities",
      "print_style omz-lifetime ':omz:plugins:ssh-agent' lifetime",
      "print_style omz-lazy ':omz:plugins:ssh-agent' lazy",
      "print_style git-sort ':completion:*:git-checkout:*' sort",
      "print_style descriptions-format ':completion:*:descriptions' format",
      "print_style directories-preview ':fzf-tab:complete:(cd|z|ls|eza):*' fzf-preview",
      "print_style parameters-preview ':fzf-tab:complete:(-command-|-parameter-|-brace-parameter-|export|unset|expand):*' fzf-preview",
      "print_style command-preview ':fzf-tab:complete:-command-:*' fzf-preview",
      "print_style fallback-preview ':fzf-tab:complete:*:*' fzf-preview",
      "print_style switch-group ':fzf-tab:*' switch-group",
      "print_style fzf-flags ':fzf-tab:*' fzf-flags",
      'print -r -- "OPTIONS_RESTORED=${options[appendhistory]},${options[incappendhistory]},${options[sharehistory]},${options[histignoredups]},${options[histsavenodups]},${options[histignorespace]}"',
      'n; dburl',
      `unset ${failureVariable}`,
      'source "$MZSH_ENTRYPOINT"; second_status=$?',
      'print -r -- "SECOND=$second_status"',
      'print -r -- "RETRY_OPTIONS=${options[appendhistory]},${options[incappendhistory]},${options[sharehistory]},${options[histignoredups]},${options[histsavenodups]},${options[histignorespace]}"',
    ].join('\n');
    const result = Bun.spawnSync([zshPath, '-fic', script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, 'home'),
        PATH: `${join(fixture, 'system')}:/usr/bin:/bin`,
        FPATH: '',
        MZSH_ENTRYPOINT: join(portableRoot, 'init.zsh'),
        MZSH_OH_MY_ZSH_ROOT: frameworkRoot,
        MZSH_PRIVATE_ZSH: join(fixture, 'missing-private.zsh'),
        MZSH_TEST_SCALAR_SENTINEL: scalarReplaySentinel,
        MZSH_TEST_ARRAY_SENTINEL: arrayReplaySentinel,
        MZSH_TEST_POLICY_SENTINEL: policyReplaySentinel,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(0);
    expect(errorOutputOf(result)).toBe('');
    expect(outputOf(result)).toContain('FIRST=1\n');
    expect(outputOf(result)).toContain(
      'RESTORED=original-rm:1:1:original-zsh:original-theme:original-tmux:original-fzf\n'
    );
    expect(outputOf(result)).toContain(
      `ARRAYS_RESTORED=user_precmd,${hostileArrayValue}:original-plugin,${hostileArrayValue}\n`
    );
    expect(outputOf(result)).toContain(`FZF_HISTORY_RESTORED=${hostileScalar}\n`);
    expect(outputOf(result)).toContain('SCALAR_TYPES=scalar-export:scalar\n');
    expect(outputOf(result)).toContain('ABSENT_SCALARS=0:0\n');
    expect(outputOf(result)).toContain('ABSENT_ARRAYS=0:0:0\n');
    expect(outputOf(result)).toContain('SIDE_EFFECTS=absent:absent:absent\n');
    expect(outputOf(result)).toContain(
      'STYLE_omz-identities=present:original_rsa,original_ed25519\n'
    );
    expect(outputOf(result)).toContain('STYLE_omz-lifetime=present:original-lifetime\n');
    expect(outputOf(result)).toContain('STYLE_omz-lazy=absent\n');
    expect(outputOf(result)).toContain('STYLE_git-sort=absent\n');
    expect(outputOf(result)).toContain(
      'STYLE_descriptions-format=present:existing description,second description\n'
    );
    expect(outputOf(result)).toContain('STYLE_directories-preview=absent\n');
    expect(outputOf(result)).toContain('STYLE_parameters-preview=absent\n');
    expect(outputOf(result)).toContain('STYLE_command-preview=absent\n');
    expect(outputOf(result)).toContain('STYLE_fallback-preview=absent\n');
    expect(outputOf(result)).toContain('STYLE_switch-group=present:[,]\n');
    expect(outputOf(result)).toContain('STYLE_fzf-flags=absent\n');
    expect(outputOf(result)).toContain('OPTIONS_RESTORED=off,on,off,on,off,on\n');
    expect(outputOf(result)).toContain('original-n\noriginal-dburl\n');
    expect(outputOf(result)).toContain('SECOND=0\n');
    expect(outputOf(result)).toContain('RETRY_OPTIONS=on,on,on,on,on,on\n');
    const initSource = readFileSync(join(portableRoot, 'init.zsh'), 'utf8');
    expect(initSource).not.toContain('eval ');
    expect(initSource).not.toContain('typeset -p');
  });
});
