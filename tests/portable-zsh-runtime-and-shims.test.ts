import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const shims = join(import.meta.dir, "..", "portable", "zsh", "shims");
const fixtureParent = join(import.meta.dir, ".fixtures");
const fixtures: string[] = [];

function fixture(): string {
  mkdirSync(fixtureParent, { recursive: true });
  const root = mkdtempSync(join(fixtureParent, "portable-shims-"));
  fixtures.push(root);
  return root;
}

function output(result: ReturnType<typeof Bun.spawnSync>): string {
  if (!(result.stdout instanceof Uint8Array)) throw new Error("expected standard output");
  return new TextDecoder().decode(result.stdout);
}

function errors(result: ReturnType<typeof Bun.spawnSync>): string {
  if (!(result.stderr instanceof Uint8Array)) throw new Error("expected standard error");
  return new TextDecoder().decode(result.stderr);
}

afterEach(() => fixtures.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe("portable runtime paths and safety shims", () => {
  test("ships executable runners and the exact managed link topology", () => {
    for (const name of ["check-prohibited", "shim-runner"]) expect(lstatSync(join(shims, name)).mode & 0o111).not.toBe(0);
    for (const name of ["bun", "bunx", "dd", "diskutil", "find", "npm", "npx", "pnpm", "prisma", "rm", "rsync", "yarn"]) {
      expect(lstatSync(join(shims, name)).isSymbolicLink()).toBe(true);
      expect(readlinkSync(join(shims, name))).toBe("shim-runner");
    }
  });

  test("delegates allowed commands and refuses recursive protected-target removal using only fakes", () => {
    const root = fixture();
    const copiedShims = join(root, "shims");
    const fakeBin = join(root, "fake-bin");
    const home = join(root, "home");
    const calls = join(root, "calls");
    cpSync(shims, copiedShims, { recursive: true });
    mkdirSync(fakeBin, { recursive: true });
    mkdirSync(home, { recursive: true });
    writeFileSync(join(fakeBin, "npm"), `#!/bin/sh\nprintf 'npm:<%s>\\n' "$@" >> ${JSON.stringify(calls)}\nprintf 'delegated\\n'\n`);
    writeFileSync(join(fakeBin, "rm"), `#!/bin/sh\nprintf 'rm:%s\\n' "$*" >> ${JSON.stringify(calls)}\n`);
    chmodSync(join(fakeBin, "npm"), 0o755);
    chmodSync(join(fakeBin, "rm"), 0o755);

    const environment = {
      HOME: home,
      PATH: `${copiedShims}:${fakeBin}:/usr/bin:/bin`,
    };
    const delegated = Bun.spawnSync([join(copiedShims, "npm"), "--version"], { env: environment, stdout: "pipe", stderr: "pipe" });
    const refused = Bun.spawnSync([join(copiedShims, "rm"), "-rf", home], { env: environment, stdout: "pipe", stderr: "pipe" });

    expect(delegated.exitCode).toBe(0);
    expect(output(delegated)).toBe("delegated\n");
    expect(errors(delegated)).toBe("");
    expect(readFileSync(calls, "utf8")).toBe("npm:<--version>\n");
    expect(refused.exitCode).toBe(64);
    expect(output(refused)).toBe("");
    expect(errors(refused)).toContain("mzsh: destructive operation refused");
    expect(readFileSync(calls, "utf8")).toBe("npm:<--version>\n");
    expect(resolve(home)).toBe(home);
  });

  test("removes recursive shim aliases before command resolution and returns 127 when no real command exists", () => {
    const root = fixture();
    const copiedShims = join(root, "shims");
    const shimAlias = join(root, "shims-by-alias");
    const fakeBin = join(root, "fake-bin");
    const calls = join(root, "calls");
    cpSync(shims, copiedShims, { recursive: true });
    mkdirSync(fakeBin, { recursive: true });
    symlinkSync(copiedShims, shimAlias);
    writeFileSync(join(fakeBin, "npm"), `#!/bin/sh\nprintf '<%s>\\n' "$@" >> ${JSON.stringify(calls)}\n`);
    chmodSync(join(fakeBin, "npm"), 0o755);

    const environment = { PATH: `${shimAlias}:${fakeBin}:/usr/bin:/bin` };
    const delegated = Bun.spawnSync([join(copiedShims, "npm"), "one value", "two"], { env: environment, stdout: "pipe", stderr: "pipe" });
    const missing = Bun.spawnSync([join(copiedShims, "bun")], { env: environment, stdout: "pipe", stderr: "pipe" });

    expect(delegated.exitCode).toBe(0);
    expect(output(delegated)).toBe("");
    expect(errors(delegated)).toBe("");
    expect(readFileSync(calls, "utf8")).toBe("<one value>\n<two>\n");
    expect(missing.exitCode).toBe(127);
  });

  test("refuses every guarded destructive command family with fakes only", () => {
    const root = fixture();
    const copiedShims = join(root, "shims");
    const fakeBin = join(root, "fake-bin");
    const home = join(root, "home");
    const calls = join(root, "calls");
    cpSync(shims, copiedShims, { recursive: true });
    mkdirSync(fakeBin, { recursive: true });
    mkdirSync(home, { recursive: true });
    for (const command of ["prisma", "npx", "rsync", "find", "diskutil", "dd"]) {
      writeFileSync(join(fakeBin, command), `#!/bin/sh\nprintf '${command}\\n' >> ${JSON.stringify(calls)}\n`);
      chmodSync(join(fakeBin, command), 0o755);
    }

    const environment = { HOME: home, PATH: `${copiedShims}:${fakeBin}:/usr/bin:/bin` };
    const refusals = [
      ["prisma", "db", "push"],
      ["npx", "prisma", "db", "push"],
      ["rsync", "--delete", "source", home],
      ["find", home, "-delete"],
      ["diskutil", "eraseDisk", "/dev/disk1"],
      ["dd", "of=/dev/rdisk1"],
    ] as const;

    for (const [command, ...arguments_] of refusals) {
      const result = Bun.spawnSync([join(copiedShims, command), ...arguments_], { env: environment, stdout: "pipe", stderr: "pipe" });
      expect(result.exitCode).toBe(64);
      expect(output(result)).toBe("");
      expect(errors(result)).toContain("mzsh: destructive operation refused");
    }
    expect(existsSync(calls)).toBe(false);
  });
});
