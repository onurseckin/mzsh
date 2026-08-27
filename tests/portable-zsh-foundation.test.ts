import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PORTABLE_INTERACTIVE_MODULE_ORDER, PORTABLE_LOGIN_MODULE_ORDER } from "../src/domain/portable-module-order";

const repositoryRoot = resolve(import.meta.dir, "..");
const entrypoint = join(repositoryRoot, "portable", "zsh", "init.zsh");
const fixtureParent = join(repositoryRoot, "tests", ".fixtures");
const fixtures: string[] = [];
const discoveredZshPath = Bun.which("zsh");

if (discoveredZshPath === null) {
  throw new Error("portable Zsh tests require zsh");
}

const zshPath = discoveredZshPath;

function portableEnvironment(): Record<string, string | undefined> {
  return {
    ...process.env,
    PNPM_HOME: "",
    MZSH_PNPM_GLOBAL_BIN: "",
    RUBY_HOME: "",
    PYTHONUSERBASE: "",
    GOPATH: "",
    JAVA_HOME: "",
  };
}

function createFixture(): string {
  mkdirSync(fixtureParent, { recursive: true });
  const fixture = mkdtempSync(join(fixtureParent, "portable-zsh-"));
  fixtures.push(fixture);
  return fixture;
}

function makeDirectory(root: string, relativePath: string): string {
  const directory = join(root, relativePath);
  mkdirSync(directory, { recursive: true });
  return directory;
}

function copyPortableRoot(fixture: string): string {
  const portableRoot = join(fixture, "portable-zsh");
  cpSync(join(repositoryRoot, "portable", "zsh"), portableRoot, { recursive: true });
  return portableRoot;
}

function injectBoundaryFailure(portableRoot: string, boundary: "path" | "oh-my-zsh" | "completion" | "private"): string {
  const modulePath = join(portableRoot, "modules", `${boundary}.zsh`);
  const module = readFileSync(modulePath, "utf8");
  const finalReturn = "\nreturn 0\n";
  const finalReturnIndex = module.lastIndexOf(finalReturn);

  if (finalReturnIndex < 0) {
    throw new Error(`expected ${boundary} module to end with return 0`);
  }

  const failureVariable = `MZSH_TEST_FAIL_AFTER_${boundary.replaceAll("-", "_").toUpperCase()}`;
  const failureHook = [
    `if [[ $${failureVariable} == 1 ]]; then`,
    `  typeset -g MZSH_TEST_BOUNDARY_EXECUTED=${boundary}`,
    "  return 1",
    "fi",
  ].join("\n");
  writeFileSync(
    modulePath,
    `${module.slice(0, finalReturnIndex)}\n${failureHook}${module.slice(finalReturnIndex)}`
  );

  return failureVariable;
}

function runEntrypoint(fixture: string, privateFile?: string): ReturnType<typeof Bun.spawnSync> {
  const script = [
    'source "$MZSH_ENTRYPOINT" || exit 1',
    'print -r -- "PATH=$PATH"',
    'print -r -- "PRIVATE=${MZSH_PRIVATE_VALUE:-absent}"',
  ].join("\n");

  return Bun.spawnSync([zshPath, "-fc", script], {
    cwd: fixture,
    env: {
      ...portableEnvironment(),
      HOME: join(fixture, "home"),
      PATH: [join(fixture, "system"), join(fixture, "system"), "/usr/bin", "/bin"].join(":"),
      XDG_CACHE_HOME: join(fixture, "cache"),
      MZSH_ENTRYPOINT: entrypoint,
      MZSH_COMMAND_SHIM_DIR: join(fixture, "shims"),
      MZSH_HOMEBREW_PREFIX: join(fixture, "homebrew"),
      BUN_INSTALL: join(fixture, "bun"),
      NVM_DIR: join(fixture, "nvm"),
      CARGO_HOME: join(fixture, "cargo"),
      ANDROID_HOME: join(fixture, "android"),
      PNPM_HOME: "",
      MZSH_PNPM_GLOBAL_BIN: "",
      RUBY_HOME: "",
      PYTHONUSERBASE: "",
      GOPATH: "",
      JAVA_HOME: "",
      MZSH_OH_MY_ZSH_ROOT: "",
      MZSH_DOCKER_COMPLETION_DIR: "",
      MZSH_PRIVATE_ZSH: privateFile === undefined ? join(fixture, "missing-private.zsh") : privateFile,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
}

function outputOf(result: ReturnType<typeof Bun.spawnSync>): string {
  if (!(result.stdout instanceof Uint8Array)) {
    throw new Error("expected piped standard output");
  }

  return new TextDecoder().decode(result.stdout);
}

function errorOutputOf(result: ReturnType<typeof Bun.spawnSync>): string {
  if (!(result.stderr instanceof Uint8Array)) {
    throw new Error("expected piped standard error");
  }

  return new TextDecoder().decode(result.stderr);
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

describe("portable Zsh foundation", () => {
  test("clears initialization state after a failed manifest so a corrected retry succeeds", () => {
    const fixture = createFixture();
    const portableRoot = copyPortableRoot(fixture);
    const manifestPath = join(portableRoot, "manifest.zsh");
    writeFileSync(
      manifestPath,
      `if [[ \${MZSH_TEST_FAIL_MANIFEST:-} == 1 ]]; then\n  return 1\nfi\n${readFileSync(manifestPath, "utf8")}`
    );
    makeDirectory(fixture, "home");
    makeDirectory(fixture, "system");

    const script = [
      "function compinit() { return 0 }",
      "MZSH_TEST_FAIL_MANIFEST=1",
      'source "$MZSH_ENTRYPOINT"; first_status=$?',
      'print -r -- "FIRST=$first_status"',
      'print -r -- "AFTER_FAILURE=${MZSH_PORTABLE_ZSH_INITIALIZED:-absent}"',
      "unset MZSH_TEST_FAIL_MANIFEST",
      'source "$MZSH_ENTRYPOINT"; second_status=$?',
      'print -r -- "SECOND=$second_status"',
      'print -r -- "AFTER_RETRY=${MZSH_PORTABLE_ZSH_INITIALIZED:-absent}"',
      'print -r -- "MODULES=${MZSH_LOADED_MODULES:-absent}"',
    ].join("\n");

    const result = Bun.spawnSync([zshPath, "-fic", script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, "home"),
        PATH: `${join(fixture, "system")}:/usr/bin:/bin`,
        FPATH: "",
        MZSH_ENTRYPOINT: join(portableRoot, "init.zsh"),
        BUN_INSTALL: "",
        NVM_DIR: "",
        CARGO_HOME: join(fixture, "missing-cargo"),
        ANDROID_HOME: "",
        ANDROID_SDK_ROOT: "",
        MZSH_OH_MY_ZSH_ROOT: "",
        MZSH_DOCKER_COMPLETION_DIR: "",
        MZSH_PRIVATE_ZSH: join(fixture, "missing-private.zsh"),
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(outputOf(result)).toContain("FIRST=1\n");
    expect(outputOf(result)).toContain("AFTER_FAILURE=absent\n");
    expect(outputOf(result)).toContain("SECOND=0\n");
    expect(outputOf(result)).toContain("AFTER_RETRY=1\n");
    expect(outputOf(result)).not.toContain("MODULES=absent\n");
  });

  test("restores MZSH-owned state after failures at path, framework, and completion boundaries", () => {
    for (const failureBoundary of ["path", "oh-my-zsh", "completion"] as const) {
      const fixture = createFixture();
      const portableRoot = copyPortableRoot(fixture);
      const failureVariable = injectBoundaryFailure(portableRoot, failureBoundary);
      makeDirectory(fixture, "home");
      makeDirectory(fixture, "system");
      const frameworkRoot = makeDirectory(fixture, "oh-my-zsh");
      writeFileSync(join(frameworkRoot, "oh-my-zsh.sh"), "typeset -g THIRD_PARTY_FRAMEWORK_MARKER=1\n");

      const script = [
        "function compinit() { return 0 }",
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
      ].join("\n");
      const shellFlags = failureBoundary === "oh-my-zsh" ? "-fic" : "-fc";
      const result = Bun.spawnSync([zshPath, shellFlags, script], {
        cwd: fixture,
        env: {
          ...portableEnvironment(),
          HOME: join(fixture, "home"),
          PATH: `${join(fixture, "system")}:/usr/bin:/bin`,
          FPATH: "",
          MZSH_ENTRYPOINT: join(portableRoot, "init.zsh"),
          [failureVariable]: "1",
          MZSH_OH_MY_ZSH_ROOT: frameworkRoot,
          BUN_INSTALL: "",
          NVM_DIR: "",
          CARGO_HOME: join(fixture, "missing-cargo"),
          ANDROID_HOME: "",
          ANDROID_SDK_ROOT: "",
          MZSH_PRIVATE_ZSH: join(fixture, "missing-private.zsh"),
        },
        stdout: "pipe",
        stderr: "pipe",
      });

      const output = outputOf(result);
      expect(result.exitCode).toBe(0);
      expect(errorOutputOf(result)).toBe("");
      expect(output).toContain("FIRST=1\n");
      expect(output).toContain(`BOUNDARY_EXECUTED=${failureBoundary}\n`);
      expect(output).toContain(`PATH_AFTER_FAILURE=${join(fixture, "system")}:/usr/bin:/bin\n`);
      expect(output).toContain("FPATH_AFTER_FAILURE=\n");
      expect(output).toContain("TRACE_AFTER_FAILURE=0\n");
      expect(output).toContain("VERSION_AFTER_FAILURE=0\n");
      expect(output).toContain("OWNER_AFTER_FAILURE=0\n");
      expect(output).toContain("PATH_HELPER_AFTER_FAILURE=0\n");
      expect(output).toContain("OBSERVE_HELPER_AFTER_FAILURE=0\n");
      expect(output).toContain("SECOND=0\n");
      expect(output).toContain(`RETRY_TRACE=${PORTABLE_INTERACTIVE_MODULE_ORDER.join(",")}\n`);
    }
  });

  test("restores prior interactive definitions after a post-framework private failure and permits a corrected retry", () => {
    const fixture = createFixture();
    const portableRoot = copyPortableRoot(fixture);
    const failureVariable = injectBoundaryFailure(portableRoot, "private");
    makeDirectory(fixture, "home");
    makeDirectory(fixture, "system");
    const frameworkRoot = makeDirectory(fixture, "oh-my-zsh");
    writeFileSync(join(frameworkRoot, "oh-my-zsh.sh"), "return 0\n");
    const scalarReplaySentinel = join(fixture, "scalar-replay-sentinel");
    const arrayReplaySentinel = join(fixture, "array-replay-sentinel");
    const policyReplaySentinel = join(fixture, "policy-replay-sentinel");
    const hostileScalar = `$(touch ${scalarReplaySentinel}) ; original-history-search`;
    const hostileArrayValue = `$(touch ${arrayReplaySentinel})`;
    const hostilePolicy = `original-policy; $(touch ${policyReplaySentinel})`;

    const script = [
      "function compinit() { return 0 }",
      "function n() { print -r -- original-n }",
      "function dburl() { print -r -- original-dburl }",
      "function user_precmd() { return 0 }",
      "alias rm=original-rm",
      `precmd_functions=(user_precmd '${hostileArrayValue}')`,
      `plugins=(original-plugin '${hostileArrayValue}')`,
      "export ZSH=original-zsh ZSH_THEME=original-theme ZSH_TMUX_CONFIG=original-tmux",
      "export FZF_DEFAULT_COMMAND=original-fzf",
      "unset FZF_DEFAULT_OPTS",
      `export FZF_CTRL_R_OPTS='${hostileScalar}'`,
      `MZSH_NVM_POLICY='${hostilePolicy}'`,
      "zstyle ':completion:*:descriptions' format 'existing description' 'second description'",
      "zstyle ':fzf-tab:*' switch-group '[' ']'",
      "zstyle ':omz:plugins:ssh-agent' identities original_rsa original_ed25519",
      "zstyle ':omz:plugins:ssh-agent' lifetime original-lifetime",
      "unsetopt append_history share_history hist_save_no_dups",
      "setopt inc_append_history hist_ignore_dups hist_ignore_space",
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
      "n; dburl",
      `unset ${failureVariable}`,
      'source "$MZSH_ENTRYPOINT"; second_status=$?',
      'print -r -- "SECOND=$second_status"',
      'print -r -- "RETRY_OPTIONS=${options[appendhistory]},${options[incappendhistory]},${options[sharehistory]},${options[histignoredups]},${options[histsavenodups]},${options[histignorespace]}"',
    ].join("\n");
    const result = Bun.spawnSync([zshPath, "-fic", script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, "home"),
        PATH: `${join(fixture, "system")}:/usr/bin:/bin`,
        FPATH: "",
        MZSH_ENTRYPOINT: join(portableRoot, "init.zsh"),
        MZSH_OH_MY_ZSH_ROOT: frameworkRoot,
        MZSH_PRIVATE_ZSH: join(fixture, "missing-private.zsh"),
        MZSH_TEST_SCALAR_SENTINEL: scalarReplaySentinel,
        MZSH_TEST_ARRAY_SENTINEL: arrayReplaySentinel,
        MZSH_TEST_POLICY_SENTINEL: policyReplaySentinel,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(errorOutputOf(result)).toBe("");
    expect(outputOf(result)).toContain("FIRST=1\n");
    expect(outputOf(result)).toContain("RESTORED=original-rm:1:1:original-zsh:original-theme:original-tmux:original-fzf\n");
    expect(outputOf(result)).toContain(`ARRAYS_RESTORED=user_precmd,${hostileArrayValue}:original-plugin,${hostileArrayValue}\n`);
    expect(outputOf(result)).toContain(`FZF_HISTORY_RESTORED=${hostileScalar}\n`);
    expect(outputOf(result)).toContain("SCALAR_TYPES=scalar-export:scalar\n");
    expect(outputOf(result)).toContain("ABSENT_SCALARS=0:0\n");
    expect(outputOf(result)).toContain("ABSENT_ARRAYS=0:0:0\n");
    expect(outputOf(result)).toContain("SIDE_EFFECTS=absent:absent:absent\n");
    expect(outputOf(result)).toContain("STYLE_omz-identities=present:original_rsa,original_ed25519\n");
    expect(outputOf(result)).toContain("STYLE_omz-lifetime=present:original-lifetime\n");
    expect(outputOf(result)).toContain("STYLE_omz-lazy=absent\n");
    expect(outputOf(result)).toContain("STYLE_git-sort=absent\n");
    expect(outputOf(result)).toContain("STYLE_descriptions-format=present:existing description,second description\n");
    expect(outputOf(result)).toContain("STYLE_directories-preview=absent\n");
    expect(outputOf(result)).toContain("STYLE_parameters-preview=absent\n");
    expect(outputOf(result)).toContain("STYLE_command-preview=absent\n");
    expect(outputOf(result)).toContain("STYLE_fallback-preview=absent\n");
    expect(outputOf(result)).toContain("STYLE_switch-group=present:[,]\n");
    expect(outputOf(result)).toContain("STYLE_fzf-flags=absent\n");
    expect(outputOf(result)).toContain("OPTIONS_RESTORED=off,on,off,on,off,on\n");
    expect(outputOf(result)).toContain("original-n\noriginal-dburl\n");
    expect(outputOf(result)).toContain("SECOND=0\n");
    expect(outputOf(result)).toContain("RETRY_OPTIONS=on,on,on,on,on,on\n");
    const initSource = readFileSync(join(portableRoot, "init.zsh"), "utf8");
    expect(initSource).not.toContain("eval ");
    expect(initSource).not.toContain("typeset -p");
  });

  test("publishes a stable successful module trace and redacted diagnostics", () => {
    const fixture = createFixture();
    for (const directory of ["home", "system"]) {
      makeDirectory(fixture, directory);
    }

    const script = [
      "function compinit() { return 0 }",
      'source "$MZSH_ENTRYPOINT"',
      'print -r -- "VERSION=$MZSH_PORTABLE_ZSH_VERSION"',
      'print -r -- "TRACE=${(j:,:)MZSH_LOADED_MODULES}"',
      'source "$MZSH_ENTRYPOINT"',
      'print -r -- "TRACE_AFTER_RESOURCE=${(j:,:)MZSH_LOADED_MODULES}"',
    ].join("\n");

    const result = Bun.spawnSync([zshPath, "-fc", script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, "home"),
        PATH: `${join(fixture, "system")}:/usr/bin:/bin`,
        MZSH_ENTRYPOINT: entrypoint,
        MZSH_OBSERVE: "1",
        BUN_INSTALL: "",
        NVM_DIR: "",
        CARGO_HOME: join(fixture, "missing-cargo"),
        ANDROID_HOME: "",
        ANDROID_SDK_ROOT: "",
        MZSH_OH_MY_ZSH_ROOT: "",
        MZSH_DOCKER_COMPLETION_DIR: "",
        MZSH_PRIVATE_ZSH: join(fixture, "missing-private.zsh"),
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const expectedTrace = PORTABLE_INTERACTIVE_MODULE_ORDER.join(",");
    expect(result.exitCode).toBe(0);
    expect(outputOf(result)).toContain("VERSION=1\n");
    expect(outputOf(result)).toContain(`TRACE=${expectedTrace}\n`);
    expect(outputOf(result)).toContain(`TRACE_AFTER_RESOURCE=${expectedTrace}\n`);
    expect(errorOutputOf(result).match(/^mzsh: module-loaded:[a-z-]+$/gm)).toHaveLength(
      PORTABLE_INTERACTIVE_MODULE_ORDER.length
    );
  });

  test("builds a deduplicated PATH in explicit application and shim precedence", () => {
    const fixture = createFixture();
    for (const directory of [
      "home",
      "system",
      "shims",
      "homebrew/bin",
      "homebrew/sbin",
      "bun/bin",
      "nvm",
      "cargo/bin",
      "android/emulator",
      "android/platform-tools",
      "android/cmdline-tools/latest/bin",
    ]) {
      makeDirectory(fixture, directory);
    }

    const result = runEntrypoint(fixture);
    const lines = outputOf(result).trim().split("\n");

    expect(result.exitCode).toBe(0);
    expect(lines).toEqual([
      `PATH=${[
        join(fixture, "shims"),
        join(fixture, "homebrew/bin"),
        join(fixture, "homebrew/sbin"),
        join(fixture, "bun/bin"),
        join(fixture, "cargo/bin"),
        join(fixture, "android/emulator"),
        join(fixture, "android/platform-tools"),
        join(fixture, "android/cmdline-tools/latest/bin"),
        join(fixture, "system"),
        "/usr/bin",
        "/bin",
      ].join(":")}`,
      "PRIVATE=absent",
    ]);
  });

  test("canonicalizes equivalent PATH directory variants without changing first precedence", () => {
    const fixture = createFixture();
    for (const directory of ["home", "system", "shims", "homebrew/bin", "homebrew/sbin"]) {
      makeDirectory(fixture, directory);
    }

    const script = ['source "$MZSH_ENTRYPOINT"', 'print -r -- "PATH=$PATH"'].join("\n");
    const result = Bun.spawnSync([zshPath, "-fc", script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, "home"),
        PATH: `${join(fixture, "system")}:${join(fixture, "system")}/:/usr/bin:/bin`,
        MZSH_ENTRYPOINT: entrypoint,
        MZSH_COMMAND_SHIM_DIR: `${join(fixture, "shims")}/`,
        MZSH_HOMEBREW_PREFIX: `${join(fixture, "homebrew")}/.`,
        BUN_INSTALL: "",
        NVM_DIR: "",
        CARGO_HOME: join(fixture, "missing-cargo"),
        ANDROID_HOME: "",
        ANDROID_SDK_ROOT: "",
        MZSH_PRIVATE_ZSH: join(fixture, "missing-private.zsh"),
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(outputOf(result)).toBe(
      `PATH=${join(fixture, "shims")}:${join(fixture, "homebrew", "bin")}:${join(fixture, "homebrew", "sbin")}:${join(fixture, "system")}:/usr/bin:/bin\n`
    );
  });

  test("does not require absent application tools or private overrides", () => {
    const fixture = createFixture();
    makeDirectory(fixture, "home");
    makeDirectory(fixture, "system");

    const result = runEntrypoint(fixture);

    expect(result.exitCode).toBe(0);
    expect(outputOf(result)).toBe(`PATH=${join(fixture, "system")}:/usr/bin:/bin\nPRIVATE=absent\n`);
    expect(errorOutputOf(result)).toBe("");
  });

  test("loads an existing NVM installation without selecting a hard-coded runtime", () => {
    const fixture = createFixture();
    makeDirectory(fixture, "home");
    makeDirectory(fixture, "system");
    const nvmDirectory = makeDirectory(fixture, "nvm");
    writeFileSync(
      join(nvmDirectory, "nvm.sh"),
      'export MZSH_NVM_LOADER_RAN=1\n[[ -f .nvmrc ]] && export MZSH_NVM_PROJECT_SELECTION=available\n'
    );
    writeFileSync(join(fixture, ".nvmrc"), "lts/*\n");

    const script = [
      "function compinit() { return 0 }",
      'source "$MZSH_ENTRYPOINT"',
      'print -r -- "NVM_POLICY=${MZSH_NVM_POLICY:-absent}"',
      'print -r -- "NVM_LOADER=${MZSH_NVM_LOADER_RAN:-absent}"',
      'print -r -- "NVM_PROJECT_SELECTION=${MZSH_NVM_PROJECT_SELECTION:-absent}"',
    ].join("\n");
    const result = Bun.spawnSync([zshPath, "-fc", script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, "home"),
        PATH: `${join(fixture, "system")}:/usr/bin:/bin`,
        FPATH: "",
        MZSH_ENTRYPOINT: entrypoint,
        NVM_DIR: nvmDirectory,
        BUN_INSTALL: "",
        CARGO_HOME: join(fixture, "missing-cargo"),
        ANDROID_HOME: "",
        ANDROID_SDK_ROOT: "",
        MZSH_OH_MY_ZSH_ROOT: "",
        MZSH_DOCKER_COMPLETION_DIR: "",
        MZSH_PRIVATE_ZSH: join(fixture, "missing-private.zsh"),
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(outputOf(result)).toContain("NVM_POLICY=existing-installation-only\n");
    expect(outputOf(result)).toContain("NVM_LOADER=1\n");
    expect(outputOf(result)).toContain("NVM_PROJECT_SELECTION=available\n");
  });

  test("uses the MZSH completion fallback exactly once when Oh My Zsh is absent", () => {
    const fixture = createFixture();
    makeDirectory(fixture, "home");
    makeDirectory(fixture, "system");

    const script = [
      "typeset -g compinit_calls=0",
      "function compinit() { (( compinit_calls++ )); return 0 }",
      'source "$MZSH_ENTRYPOINT"; source_status=$?',
      'print -r -- "SOURCE_STATUS=$source_status"',
      'print -r -- "COMPLETION_OWNER=${MZSH_COMPLETION_OWNER:-absent}"',
      'print -r -- "COMPINIT_CALLS=$compinit_calls"',
    ].join("\n");
    const result = Bun.spawnSync([zshPath, "-fc", script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, "home"),
        PATH: `${join(fixture, "system")}:/usr/bin:/bin`,
        XDG_CACHE_HOME: join(fixture, "cache"),
        MZSH_ENTRYPOINT: entrypoint,
        BUN_INSTALL: "",
        NVM_DIR: "",
        CARGO_HOME: join(fixture, "missing-cargo"),
        ANDROID_HOME: "",
        ANDROID_SDK_ROOT: "",
        MZSH_PRIVATE_ZSH: join(fixture, "missing-private.zsh"),
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(errorOutputOf(result)).toBe("");
    expect(outputOf(result)).toContain("SOURCE_STATUS=0\n");
    expect(outputOf(result)).toContain("COMPLETION_OWNER=mzsh\n");
    expect(outputOf(result)).toContain("COMPINIT_CALLS=1\n");
  });

  test("registers completion directories before the framework owns one initialization", () => {
    const fixture = createFixture();
    makeDirectory(fixture, "home");
    makeDirectory(fixture, "system");
    const homebrewPrefix = makeDirectory(fixture, "homebrew");
    makeDirectory(fixture, "homebrew/share/zsh/site-functions");
    const dockerCompletionDirectory = makeDirectory(fixture, "docker-completions");
    const frameworkRoot = makeDirectory(fixture, "oh-my-zsh");
    writeFileSync(
      join(frameworkRoot, "oh-my-zsh.sh"),
      [
        "typeset -g MZSH_FRAMEWORK_COMPINIT_CALLS=0",
        "function compinit() {",
        "  (( MZSH_FRAMEWORK_COMPINIT_CALLS++ ))",
        "  typeset -g MZSH_FRAMEWORK_FPATH_AT_COMPINIT=\"${(j:,:)fpath}\"",
        "  return 0",
        "}",
        "compinit",
      ].join("\n")
    );

    const script = [
      'source "$MZSH_ENTRYPOINT" || exit 1',
      'print -r -- "COMPLETION_OWNER=$MZSH_COMPLETION_OWNER"',
      'print -r -- "FRAMEWORK_COMPINIT_CALLS=$MZSH_FRAMEWORK_COMPINIT_CALLS"',
      'print -r -- "FRAMEWORK_FPATH_AT_COMPINIT=$MZSH_FRAMEWORK_FPATH_AT_COMPINIT"',
    ].join("\n");
    const result = Bun.spawnSync([zshPath, "-fic", script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, "home"),
        PATH: `${join(fixture, "system")}:/usr/bin:/bin`,
        FPATH: "",
        MZSH_ENTRYPOINT: entrypoint,
        MZSH_HOMEBREW_PREFIX: homebrewPrefix,
        MZSH_DOCKER_COMPLETION_DIR: dockerCompletionDirectory,
        MZSH_OH_MY_ZSH_ROOT: frameworkRoot,
        BUN_INSTALL: "",
        NVM_DIR: "",
        CARGO_HOME: join(fixture, "missing-cargo"),
        ANDROID_HOME: "",
        ANDROID_SDK_ROOT: "",
        MZSH_PRIVATE_ZSH: join(fixture, "missing-private.zsh"),
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(outputOf(result)).toContain("COMPLETION_OWNER=oh-my-zsh\n");
    expect(outputOf(result)).toContain("FRAMEWORK_COMPINIT_CALLS=1\n");
    expect(outputOf(result)).toMatch(
      new RegExp(`FRAMEWORK_FPATH_AT_COMPINIT=.*${join(homebrewPrefix, "share", "zsh", "site-functions")}`)
    );
    expect(outputOf(result)).toMatch(new RegExp(`FRAMEWORK_FPATH_AT_COMPINIT=.*${dockerCompletionDirectory}`));
  });

  test("loads only permission-restricted local private overrides", () => {
    const fixture = createFixture();
    makeDirectory(fixture, "home");
    makeDirectory(fixture, "system");
    const privateFile = join(fixture, "private.zsh");
    writeFileSync(privateFile, "export MZSH_PRIVATE_VALUE=loaded\n");
    chmodSync(privateFile, 0o600);

    const result = runEntrypoint(fixture, privateFile);

    expect(result.exitCode).toBe(0);
    expect(outputOf(result)).toContain("PRIVATE=loaded\n");
  });

  test("rejects insecure local private overrides without emitting output by default", () => {
    const fixture = createFixture();
    makeDirectory(fixture, "home");
    makeDirectory(fixture, "system");
    const privateFile = join(fixture, "private.zsh");
    writeFileSync(privateFile, "export MZSH_PRIVATE_VALUE=leaked\n");
    chmodSync(privateFile, 0o644);

    const result = runEntrypoint(fixture, privateFile);

    expect(result.exitCode).toBe(0);
    expect(outputOf(result)).toContain("PRIVATE=absent\n");
    expect(errorOutputOf(result)).toBe("");
  });

  test("rejects a symlinked private override even when its target is owner-only", () => {
    const fixture = createFixture();
    makeDirectory(fixture, "home");
    makeDirectory(fixture, "system");
    const privateTarget = join(fixture, "private-target.zsh");
    const privateLink = join(fixture, "private-link.zsh");
    writeFileSync(privateTarget, "export MZSH_PRIVATE_VALUE=leaked\n");
    chmodSync(privateTarget, 0o600);
    symlinkSync(privateTarget, privateLink);

    const result = runEntrypoint(fixture, privateLink);

    expect(result.exitCode).toBe(0);
    expect(outputOf(result)).toContain("PRIVATE=absent\n");
  });

  test("rejects a private override when stat reports a foreign owner", () => {
    const fixture = createFixture();
    makeDirectory(fixture, "home");
    makeDirectory(fixture, "system");
    const privateFile = join(fixture, "private.zsh");
    const fakeBin = makeDirectory(fixture, "fake-bin");
    const fakeStat = join(fakeBin, "stat");
    writeFileSync(privateFile, "export MZSH_PRIVATE_VALUE=leaked\n");
    chmodSync(privateFile, 0o600);
    writeFileSync(
      fakeStat,
      [
        "#!/bin/sh",
        'if [ "$1" = "-f" ] && [ "$2" = "%Lp" ]; then printf "600\\n"; exit 0; fi',
        'if [ "$1" = "-f" ] && [ "$2" = "%u" ]; then printf "99999\\n"; exit 0; fi',
        "exit 1",
      ].join("\n")
    );
    chmodSync(fakeStat, 0o755);

    const script = [
      "function compinit() { return 0 }",
      'source "$MZSH_ENTRYPOINT"; source_status=$?',
      'print -r -- "SOURCE_STATUS=$source_status"',
      'print -r -- "PRIVATE=${MZSH_PRIVATE_VALUE:-absent}"',
    ].join("\n");
    const result = Bun.spawnSync([zshPath, "-fc", script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, "home"),
        PATH: `${fakeBin}:${join(fixture, "system")}:/usr/bin:/bin`,
        FPATH: "",
        MZSH_ENTRYPOINT: entrypoint,
        BUN_INSTALL: "",
        NVM_DIR: "",
        CARGO_HOME: join(fixture, "missing-cargo"),
        ANDROID_HOME: "",
        ANDROID_SDK_ROOT: "",
        MZSH_PRIVATE_ZSH: privateFile,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(errorOutputOf(result)).toBe("");
    expect(outputOf(result)).toContain("SOURCE_STATUS=0\n");
    expect(outputOf(result)).toContain("PRIVATE=absent\n");
  });

  test("removes the private permission helper after initialization", () => {
    const fixture = createFixture();
    makeDirectory(fixture, "home");
    makeDirectory(fixture, "system");

    const script = [
      'source "$MZSH_ENTRYPOINT"; source_status=$?',
      'print -r -- "SOURCE_STATUS=$source_status"',
      'print -r -- "PRIVATE_HELPER=${+functions[mzsh_private_mode]}"',
    ].join("\n");
    const result = Bun.spawnSync([zshPath, "-fc", script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, "home"),
        PATH: `${join(fixture, "system")}:/usr/bin:/bin`,
        MZSH_ENTRYPOINT: entrypoint,
        BUN_INSTALL: "",
        NVM_DIR: "",
        CARGO_HOME: join(fixture, "missing-cargo"),
        ANDROID_HOME: "",
        ANDROID_SDK_ROOT: "",
        MZSH_PRIVATE_ZSH: join(fixture, "missing-private.zsh"),
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(outputOf(result)).toContain("SOURCE_STATUS=0\n");
    expect(outputOf(result)).toContain("PRIVATE_HELPER=0\n");
  });

  test("provides quiet syntax-valid loaders for all shell entrypoint contexts", () => {
    const fixture = createFixture();
    makeDirectory(fixture, "home");
    makeDirectory(fixture, "system");

    for (const [loaderName, expectedContext, shellFlags] of [
      ["zshenv.zsh", "all-shell", "-dfc"],
      ["zprofile.zsh", "login", "-dflc"],
      ["zshrc.zsh", "interactive", "-dfic"],
    ]) {
      const loader = join(repositoryRoot, "portable", "zsh", "loaders", loaderName);
      const script = [
        'source "$MZSH_LOADER"; source_status=$?',
        'print -r -- "SOURCE_STATUS=$source_status"',
        'print -r -- "CONTEXT=${MZSH_PORTABLE_ZSH_LOADER_CONTEXT:-absent}"',
      ].join("\n");
      const result = Bun.spawnSync([zshPath, shellFlags, script], {
        cwd: fixture,
        env: {
          ...portableEnvironment(),
          HOME: join(fixture, "home"),
          PATH: `${join(fixture, "system")}:/usr/bin:/bin`,
          MZSH_LOADER: loader,
        },
        stdout: "pipe",
        stderr: "pipe",
      });

      expect(result.exitCode).toBe(0);
      expect(errorOutputOf(result)).toBe("");
      expect(outputOf(result)).toContain("SOURCE_STATUS=0\n");
      expect(outputOf(result)).toContain(`CONTEXT=${expectedContext}\n`);
    }
  });

  test("keeps TypeScript and Zsh module orders identical", () => {
    const manifest = readFileSync(join(repositoryRoot, "portable", "zsh", "manifest.zsh"), "utf8");
    const loginManifest = readFileSync(join(repositoryRoot, "portable", "zsh", "login-manifest.zsh"), "utf8");
    const modulesIn = (source: string, arrayName: string): string[] => {
      const match = source.match(new RegExp(`${arrayName}=\\(\\n([\\s\\S]*?)\\n\\)`));
      return match?.[1]?.trim().split(/\s+/) ?? [];
    };
    const interactiveModules = [
      ...modulesIn(manifest, "mzsh_pre_framework_modules"),
      ...modulesIn(manifest, "mzsh_framework_modules"),
    ];
    const loginModules = modulesIn(loginManifest, "mzsh_login_modules");

    expect(interactiveModules).toEqual([...PORTABLE_INTERACTIVE_MODULE_ORDER]);
    expect(loginModules).toEqual([...PORTABLE_LOGIN_MODULE_ORDER]);
  });

  test("loads login paths before interactive behavior and remains idempotent", () => {
    const fixture = createFixture();
    for (const directory of ["home", "system", "shims", "homebrew/bin", "homebrew/sbin", "bun/bin", "cargo/bin"]) {
      makeDirectory(fixture, directory);
    }

    const script = [
      "function compinit() { return 0 }",
      'source "$MZSH_ZPROFILE" || exit 1',
      'print -r -- "LOGIN=${(j:,:)MZSH_LOGIN_LOADED_MODULES}"',
      'source "$MZSH_ZSHRC" || exit 1',
      'source "$MZSH_ZSHRC" || exit 1',
      'print -r -- "INTERACTIVE=${(j:,:)MZSH_LOADED_MODULES}"',
      'print -r -- "PATH=$PATH"',
    ].join("\n");
    const result = Bun.spawnSync([zshPath, "-dfl", "-i", "-c", script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, "home"),
        PATH: `${join(fixture, "system")}:${join(fixture, "system")}:/usr/bin:/bin`,
        MZSH_ZPROFILE: join(repositoryRoot, "portable", "zsh", "loaders", "zprofile.zsh"),
        MZSH_ZSHRC: join(repositoryRoot, "portable", "zsh", "loaders", "zshrc.zsh"),
        MZSH_COMMAND_SHIM_DIR: join(fixture, "shims"),
        MZSH_HOMEBREW_PREFIX: join(fixture, "homebrew"),
        MZSH_MACPORTS_PREFIX: "",
        BUN_INSTALL: join(fixture, "bun"),
        NVM_DIR: "",
        CARGO_HOME: join(fixture, "cargo"),
        ANDROID_HOME: "",
        ANDROID_SDK_ROOT: "",
        PNPM_HOME: "",
        MZSH_PNPM_GLOBAL_BIN: "",
        RUBY_HOME: "",
        PYTHONUSERBASE: "",
        GOPATH: "",
        JAVA_HOME: "",
        MZSH_OH_MY_ZSH_ROOT: "",
        MZSH_PRIVATE_ZSH: join(fixture, "missing-private.zsh"),
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(errorOutputOf(result)).toBe("");
    expect(outputOf(result)).toContain(`LOGIN=${PORTABLE_LOGIN_MODULE_ORDER.join(",")}\n`);
    expect(outputOf(result)).toContain(`INTERACTIVE=${PORTABLE_INTERACTIVE_MODULE_ORDER.join(",")}\n`);
    const pathLine = outputOf(result)
      .split("\n")
      .find((line) => line.startsWith("PATH="));
    expect(pathLine?.replace(/^PATH=/, "").split(":").filter((entry) => entry === join(fixture, "shims"))).toHaveLength(1);
    expect(pathLine?.startsWith(`PATH=${join(fixture, "shims")}:`)).toBe(true);
  });

  test("emits observability only when explicitly enabled", () => {
    const fixture = createFixture();
    makeDirectory(fixture, "home");
    makeDirectory(fixture, "system");
    const privateFile = join(fixture, "private.zsh");
    writeFileSync(privateFile, "export MZSH_PRIVATE_VALUE=leaked\n");
    chmodSync(privateFile, 0o644);

    const script = 'source "$MZSH_ENTRYPOINT"';
    const result = Bun.spawnSync([zshPath, "-fc", script], {
      cwd: fixture,
      env: {
        ...portableEnvironment(),
        HOME: join(fixture, "home"),
        PATH: `${join(fixture, "system")}:/usr/bin:/bin`,
        MZSH_ENTRYPOINT: entrypoint,
        MZSH_PRIVATE_ZSH: privateFile,
        MZSH_OBSERVE: "1",
        BUN_INSTALL: "",
        NVM_DIR: "",
        CARGO_HOME: join(fixture, "missing-cargo"),
        ANDROID_HOME: "",
        ANDROID_SDK_ROOT: "",
        MZSH_OH_MY_ZSH_ROOT: "",
        MZSH_DOCKER_COMPLETION_DIR: "",
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(new TextDecoder().decode(result.stdout)).toBe("");
    expect(errorOutputOf(result)).toContain("mzsh: skipped insecure private override");
  });

  test("keeps secret values out of the portable tree", () => {
    const portableFiles = [
      "init.zsh",
      "manifest.zsh",
      "login-manifest.zsh",
      "modules/path.zsh",
      "modules/homebrew.zsh",
      "modules/bun.zsh",
      "modules/nvm.zsh",
      "modules/rust.zsh",
      "modules/android.zsh",
      "modules/oh-my-zsh.zsh",
      "modules/completion-directories.zsh",
      "modules/completion.zsh",
      "modules/private.zsh",
      "modules/observability.zsh",
      "modules/safety-shims.zsh",
      "modules/macports.zsh",
      "modules/runtime-paths.zsh",
      "modules/prompt-vi.zsh",
      "modules/aliases.zsh",
      "modules/search.zsh",
      "modules/history.zsh",
      "modules/dburl.zsh",
      "modules/ports-manager.zsh",
      "loaders/zshenv.zsh",
      "loaders/zprofile.zsh",
      "loaders/zshrc.zsh",
    ];

    for (const relativePath of portableFiles) {
      const source = readFileSync(join(repositoryRoot, "portable", "zsh", relativePath), "utf8");
      expect(source).not.toMatch(/(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|tsec_[A-Za-z0-9_-]{12,})/);
    }
  });
});
