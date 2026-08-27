import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArguments } from "../src/cli/parse-arguments";
import { classifySensitiveAssignment } from "../src/application/sensitive-assignment-policy";
import { runMzshCli } from "../src/cli/run-cli";
import type { EnvironmentSnapshot } from "../src/domain/audit";
import { isManagedCliRoute, managedRepositoryRoot } from "../src/index";

const snapshot: EnvironmentSnapshot = {
  roots: { home: "/home", xdgConfig: "/home/.config", xdgCache: "/home/.cache", repository: "/checkout" },
  repository: { kind: "missing", root: "/checkout", reason: "root-absent" }, pathEntries: [], zshTopology: "modular", currentLink: "absent",
  privateFile: { kind: "absent", assignmentCount: 0 }, nodeOwnership: { nvmInteractive: false, homebrewPrivateNode: false }, pnpm: { status: "absent", globalBinDiscoverable: false }, java: { status: "not-applicable" }, commands: [], probeFailures: [],
};

function cliFixture(): { root: string; home: string; config: string; repository: string; legacy: string } {
  const fixtureParent = join(import.meta.dir, ".fixtures");
  mkdirSync(fixtureParent, { recursive: true });
  const root = mkdtempSync(join(fixtureParent, "mzsh-cli-"));
  const home = join(root, "home"); const config = join(home, ".config"); const repository = join(root, "repository"); const legacy = join(home, "legacy.zsh");
  mkdirSync(config, { recursive: true }); mkdirSync(join(repository, "portable", "zsh", "shims"), { recursive: true });
  writeFileSync(join(repository, "package.json"), JSON.stringify({ name: "mzsh", version: "1.0.0" })); writeFileSync(join(repository, "portable", "zsh", "init.zsh"), "return 0\n");
  writeFileSync(legacy, "export API_TOKEN=inert-placeholder\nexport PATH=/safe/bin\n");
  return { root, home, config, repository, legacy };
}

describe("MZSH managed CLI", () => {
  test("parses only absolute managed command paths and defaults mutations to dry run", () => {
    expect(parseArguments(["bootstrap", "--source", "/checkout"])).toEqual({ kind: "bootstrap", source: "/checkout", apply: false });
    expect(parseArguments(["rollback", "receipt_1", "--apply"])).toEqual({ kind: "rollback", receiptId: "receipt_1", apply: true });
    expect(parseArguments(["bootstrap", "--source", "relative"])).toEqual(expect.objectContaining({ kind: "usage-error" }));
    expect(parseArguments(["audit", "--apply"])).toEqual(expect.objectContaining({ kind: "usage-error" }));
    expect(parseArguments(["--update"])).toEqual(expect.objectContaining({ kind: "retired" }));
  });

  test("classifies plain credential assignments without returning their name or value", () => {
    expect(classifySensitiveAssignment("export API_TOKEN=inert-placeholder")).toBe(true);
    expect(classifySensitiveAssignment("export PATH=/safe/bin")).toBe(false);
    expect(classifySensitiveAssignment("export TOKEN=$(unsafe)")).toBe(true);
  });

  test("renders real audit reports as approved JSON or stable human findings", () => {
    const output: string[] = [];
    const dependencies = { home: "/home", xdgConfig: "/home/.config", xdgCache: "/home/.cache", repositoryRoot: "/checkout", write: (message: string) => output.push(message), probes: { collect: () => snapshot } };
    expect(runMzshCli(["audit", "--json"], dependencies)).toBe(0);
    expect(output[0]).toContain("REPOSITORY_MISSING");
    output.splice(0);
    expect(runMzshCli(["audit"], dependencies)).toBe(0);
    expect(output[0]).toBe("WARNING REPOSITORY_MISSING The configured MZSH repository root is absent.");
  });

  test("rejects duplicate flags, stray positionals, unsupported flags, and traversal", () => {
    for (const args of [["bootstrap", "--source", "/a", "--source", "/b"], ["audit", "extra"], ["update", "--legacy-source", "/a"], ["rollback", "../receipt"], ["rollback", "receipt", "--source", "/a"], ["rollback", "receipt", "--legacy-source", "/a"], ["rollback", "receipt", "--json"], ["rollback", "receipt", "extra"]]) {
      expect(parseArguments(args)).toEqual(expect.objectContaining({ kind: "usage-error" }));
    }
  });

  test("resolves the managed checkout from the installed module directory", () => {
    expect(managedRepositoryRoot("/opt/mzsh/lib")).toBe("/opt/mzsh");
    expect(isManagedCliRoute(["--open-type", "vim", "--update"])).toBe(true);
    expect(isManagedCliRoute(["--reinstall"])).toBe(true);
    expect(isManagedCliRoute(["--uninst"])).toBe(true);
  });

  test("bootstrap dry-run emits exact safe metadata and apply is the only apply invocation", () => {
    const fixture = cliFixture();
    try {
      const output: string[] = []; let applied = 0;
      const dependencies = { home: fixture.home, xdgConfig: fixture.config, xdgCache: join(fixture.home, ".cache"), repositoryRoot: fixture.repository, write: (message: string) => output.push(message), id: () => "cli-tx", apply: () => { applied += 1; return { kind: "applied" as const, receiptPath: join(fixture.config, "receipt") }; } };
      expect(runMzshCli(["bootstrap", "--source", fixture.repository, "--legacy-source", fixture.legacy], dependencies)).toBe(0);
      expect(applied).toBe(0);
      const summary = output[0]!;
      expect(summary).toContain('"id":"cli-tx"'); expect(summary).toContain('"sensitiveAssignmentCount":1'); expect(summary).toContain('"repositoryPreconditions"'); expect(summary).toContain('"mutations"');
      expect(summary).not.toContain("API_TOKEN"); expect(summary).not.toContain("inert-placeholder"); expect(summary).not.toContain("export API_TOKEN");
      output.splice(0);
      expect(runMzshCli(["bootstrap", "--source", fixture.repository, "--legacy-source", fixture.legacy, "--apply"], dependencies)).toBe(0);
      expect(applied).toBe(1);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  });

  test("update uses the same local plan and rollback uses only the contained receipt path", () => {
    const fixture = cliFixture();
    try {
      let applied = 0; const rollbackPaths: string[] = [];
      const dependencies = { home: fixture.home, xdgConfig: fixture.config, xdgCache: join(fixture.home, ".cache"), repositoryRoot: fixture.repository, write: (_message: string) => undefined, id: () => "update-tx", apply: () => { applied += 1; return { kind: "applied" as const, receiptPath: "receipt" }; }, rollback: (input: { receiptPath: string; dryRun: boolean }) => { rollbackPaths.push(`${input.receiptPath}:${input.dryRun}`); return input.dryRun ? { kind: "ready" as const, dryRun: true as const, paths: [] } : { kind: "rolled-back" as const, paths: [] }; } };
      expect(runMzshCli(["update", "--source", fixture.repository], dependencies)).toBe(0); expect(applied).toBe(0);
      expect(runMzshCli(["update", "--source", fixture.repository, "--apply"], dependencies)).toBe(0); expect(applied).toBe(1);
      expect(runMzshCli(["rollback", "receipt_1"], dependencies)).toBe(0);
      expect(runMzshCli(["rollback", "receipt_1", "--apply"], dependencies)).toBe(0);
      expect(rollbackPaths).toEqual([`${join(fixture.config, "mzsh", "state", "receipt_1", "receipt.json")}:true`, `${join(fixture.config, "mzsh", "state", "receipt_1", "receipt.json")}:false`]);
      expect(runMzshCli(["rollback", "../escape"], dependencies)).toBe(2);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  });
});
