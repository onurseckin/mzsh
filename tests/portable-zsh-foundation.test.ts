import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "..");
const entrypoint = join(repositoryRoot, "portable", "zsh", "init.zsh");
const fixtureParent = join(repositoryRoot, "tests", ".fixtures");
const fixtures: string[] = [];
const discoveredZshPath = Bun.which("zsh");

if (discoveredZshPath === null) {
  throw new Error("portable Zsh tests require zsh");
}

const zshPath = discoveredZshPath;

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

function injectBoundaryFailure(portableRoot: string, boundary: "path" | "oh-my-zsh" | "completion"): string {
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
      ...process.env,
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

    const result = Bun.spawnSync([zshPath, "-fc", script], {
      cwd: fixture,
      env: {
        ...process.env,
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
      const result = Bun.spawnSync([zshPath, "-fc", script], {
        cwd: fixture,
        env: {
          ...process.env,
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
      expect(output).toContain("RETRY_TRACE=observability,path,homebrew,bun,nvm,rust,android,private,completion-directories,oh-my-zsh,completion\n");
    }
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
        ...process.env,
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

    const expectedTrace = "observability,path,homebrew,bun,nvm,rust,android,private,completion-directories,oh-my-zsh,completion";
    expect(result.exitCode).toBe(0);
    expect(outputOf(result)).toContain("VERSION=1\n");
    expect(outputOf(result)).toContain(`TRACE=${expectedTrace}\n`);
    expect(outputOf(result)).toContain(`TRACE_AFTER_RESOURCE=${expectedTrace}\n`);
    expect(errorOutputOf(result).match(/^mzsh: module-loaded:[a-z-]+$/gm)).toHaveLength(11);
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
        ...process.env,
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
        ...process.env,
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
        ...process.env,
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
    const result = Bun.spawnSync([zshPath, "-fc", script], {
      cwd: fixture,
      env: {
        ...process.env,
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
        ...process.env,
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
        ...process.env,
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

    for (const [loaderName, expectedContext] of [
      ["zshenv.zsh", "all-shell"],
      ["zprofile.zsh", "login"],
      ["zshrc.zsh", "interactive"],
    ]) {
      const loader = join(repositoryRoot, "portable", "zsh", "loaders", loaderName);
      const script = [
        'source "$MZSH_LOADER"; source_status=$?',
        'print -r -- "SOURCE_STATUS=$source_status"',
        'print -r -- "CONTEXT=${MZSH_PORTABLE_ZSH_LOADER_CONTEXT:-absent}"',
      ].join("\n");
      const result = Bun.spawnSync([zshPath, "-dfc", script], {
        cwd: fixture,
        env: {
          ...process.env,
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
        ...process.env,
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
