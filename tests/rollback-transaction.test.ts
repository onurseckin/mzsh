import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { applyAdoption } from "../src/application/apply-adoption";
import { planAdoption } from "../src/application/plan-adoption";
import { rollbackAdoption } from "../src/application/rollback-adoption";
import { NodeAdoptionFilesystem } from "../src/infrastructure/adoption-filesystem";

const fixtureParent = join(import.meta.dir, ".fixtures");
const fixtures: string[] = [];
const passingPreflight = () => ({ kind: "passed" as const });

function fixture(): string {
  mkdirSync(fixtureParent, { recursive: true });
  const root = mkdtempSync(join(fixtureParent, "rollback-"));
  fixtures.push(root);
  return root;
}

function applyFixture(id: string): { home: string; receipt: string; repository: string } {
  const root = fixture();
  const home = join(root, "home");
  const repository = join(root, "repository");
  mkdirSync(join(home, ".config"), { recursive: true });
  mkdirSync(join(repository, "portable", "zsh", "shims"), { recursive: true });
  writeFileSync(join(repository, "package.json"), JSON.stringify({ name: "mzsh", version: "1.0.0" }));
  writeFileSync(join(repository, "portable", "zsh", "init.zsh"), "return 0\n");
  writeFileSync(join(home, ".zshrc"), "before-rollback\n");
  const planned = planAdoption({ home, repository, config: join(home, ".config") }, { filesystem: new NodeAdoptionFilesystem(), id: () => id });
  if (planned.kind !== "ready") throw new Error("expected plan");
  if (applyAdoption(planned.plan, { filesystem: new NodeAdoptionFilesystem(), preflight: passingPreflight }).kind !== "applied") throw new Error("expected apply");
  return { home, receipt: join(home, ".config", "mzsh", "state", id, "receipt.json"), repository };
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("adoption rollback transaction", () => {
  test("dry run compares receipt state without mutation", () => {
    const applied = applyFixture("rollback-1");
    const result = rollbackAdoption({ receiptPath: applied.receipt, dryRun: true }, { filesystem: new NodeAdoptionFilesystem() });
    expect(result).toEqual({ kind: "ready", dryRun: true, paths: expect.any(Array) });
    expect(readFileSync(join(applied.home, ".zshrc"), "utf8")).toContain("mzsh-managed-loader");
  });

  test("restores backups and atomically marks the receipt unavailable", () => {
    const applied = applyFixture("rollback-2");
    expect(rollbackAdoption({ receiptPath: applied.receipt, dryRun: false }, { filesystem: new NodeAdoptionFilesystem() })).toEqual(
      expect.objectContaining({ kind: "rolled-back" })
    );
    expect(readFileSync(join(applied.home, ".zshrc"), "utf8")).toBe("before-rollback\n");
    expect(readFileSync(applied.receipt, "utf8")).toContain('"status":"unavailable"');
  });

  test("refuses the whole rollback when any managed target changed", () => {
    const applied = applyFixture("rollback-3");
    writeFileSync(join(applied.home, ".zshrc"), "user-owned-change\n");
    const result = rollbackAdoption({ receiptPath: applied.receipt, dryRun: false }, { filesystem: new NodeAdoptionFilesystem() });
    expect(result).toEqual(expect.objectContaining({ kind: "conflict", paths: [join(applied.home, ".zshrc")] }));
    expect(readFileSync(join(applied.home, ".zshrc"), "utf8")).toBe("user-owned-change\n");
  });

  test("rejects crafted receipt paths before any rollback mutation", () => {
    const applied = applyFixture("rollback-malicious");
    const receipt = JSON.parse(readFileSync(applied.receipt, "utf8")) as { targets: Array<Record<string, unknown>> };
    receipt.targets[0] = {
      ...receipt.targets[0],
      original: { path: "/outside/target", kind: "absent" },
      applied: { path: "/outside/target", kind: "file", mode: 0o600, hash: "0".repeat(64) },
      backupRelativePath: "../../outside/backup",
    };
    writeFileSync(applied.receipt, JSON.stringify(receipt));

    expect(rollbackAdoption({ receiptPath: applied.receipt, dryRun: false }, { filesystem: new NodeAdoptionFilesystem() })).toEqual(
      expect.objectContaining({ kind: "failed", code: "receipt-invalid" })
    );
    expect(readFileSync(join(applied.home, ".zshrc"), "utf8")).toContain("mzsh-managed-loader");
  });

  test("rejects receipts whose declared home or config root is a symlink", () => {
    const homeRoot = applyFixture("rollback-symlink-home");
    const movedHome = join(homeRoot.home, "..", "moved-home");
    renameSync(homeRoot.home, movedHome);
    symlinkSync(movedHome, homeRoot.home);
    expect(rollbackAdoption({ receiptPath: homeRoot.receipt, dryRun: true }, { filesystem: new NodeAdoptionFilesystem() })).toEqual(
      expect.objectContaining({ kind: "failed", code: "receipt-invalid" })
    );

    const configRoot = applyFixture("rollback-symlink-config");
    const movedConfig = join(configRoot.home, "..", "moved-config");
    renameSync(join(configRoot.home, ".config"), movedConfig);
    symlinkSync(movedConfig, join(configRoot.home, ".config"));
    expect(rollbackAdoption({ receiptPath: configRoot.receipt, dryRun: true }, { filesystem: new NodeAdoptionFilesystem() })).toEqual(
      expect.objectContaining({ kind: "failed", code: "receipt-invalid" })
    );
  });

  test("rolls back from protected backups after the provenance repository is removed", () => {
    const applied = applyFixture("rollback-repository-removed");
    rmSync(applied.repository, { recursive: true, force: true });
    expect(rollbackAdoption({ receiptPath: applied.receipt, dryRun: true }, { filesystem: new NodeAdoptionFilesystem() })).toEqual(
      expect.objectContaining({ kind: "ready", dryRun: true })
    );
    expect(rollbackAdoption({ receiptPath: applied.receipt, dryRun: false }, { filesystem: new NodeAdoptionFilesystem() })).toEqual(
      expect.objectContaining({ kind: "rolled-back" })
    );
    expect(readFileSync(join(applied.home, ".zshrc"), "utf8")).toBe("before-rollback\n");
  });

  test("rejects writable state and backup directories before conflicts or rollback journal creation", () => {
    for (const directoryName of ["state", "backups"]) {
      const id = `rollback-writable-${directoryName}`;
      const applied = applyFixture(id);
      const stateDirectory = dirname(applied.receipt);
      const unsafeDirectory = directoryName === "state" ? stateDirectory : join(stateDirectory, "backups");
      const loader = join(applied.home, ".zshrc");
      const before = readFileSync(loader, "utf8");
      chmodSync(unsafeDirectory, 0o777);
      expect(rollbackAdoption({ receiptPath: applied.receipt, dryRun: true }, { filesystem: new NodeAdoptionFilesystem() })).toEqual(
        expect.objectContaining({ kind: "failed", code: "receipt-invalid" })
      );
      expect(rollbackAdoption({ receiptPath: applied.receipt, dryRun: false }, { filesystem: new NodeAdoptionFilesystem() })).toEqual(
        expect.objectContaining({ kind: "failed", code: "receipt-invalid" })
      );
      expect(readFileSync(loader, "utf8")).toBe(before);
      expect(() => lstatSync(join(stateDirectory, "rollback-journal"))).toThrow();
    }
  });

  test("compensates a mid-rollback restore failure and leaves the receipt applied", () => {
    const applied = applyFixture("rollback-compensation");
    class FailingRestoreFilesystem extends NodeAdoptionFilesystem {
      private restoreCalls = 0;

      override restore(...args: Parameters<NodeAdoptionFilesystem["restore"]>): void {
        this.restoreCalls += 1;
        if (this.restoreCalls === 2) throw new Error("injected rollback failure");
        super.restore(...args);
      }
    }

    expect(rollbackAdoption({ receiptPath: applied.receipt, dryRun: false }, { filesystem: new FailingRestoreFilesystem() })).toEqual(
      expect.objectContaining({ kind: "failed", code: "rollback-failed" })
    );
    expect(lstatSync(join(applied.home, ".config", "mzsh", "current")).isSymbolicLink()).toBe(true);
    expect(readFileSync(applied.receipt, "utf8")).toContain('"status":"applied"');
  });

  test("compensates a receipt-unavailable publication failure back to applied state", () => {
    const applied = applyFixture("rollback-receipt-publication");
    class ReceiptPublicationFailureFilesystem extends NodeAdoptionFilesystem {
      private failed = false;

      override writeAtomic(path: string, content: string | Uint8Array, mode?: number): void {
        super.writeAtomic(path, content, mode);
        if (path === applied.receipt && !this.failed && typeof content === "string" && content.includes('"status":"unavailable"')) {
          this.failed = true;
          throw new Error("injected receipt publication failure");
        }
      }
    }
    expect(rollbackAdoption({ receiptPath: applied.receipt, dryRun: false }, { filesystem: new ReceiptPublicationFailureFilesystem() })).toEqual(
      expect.objectContaining({ kind: "failed", code: "rollback-failed" })
    );
    expect(lstatSync(join(applied.home, ".config", "mzsh", "current")).isSymbolicLink()).toBe(true);
    expect(readFileSync(applied.receipt, "utf8")).toContain('"status":"applied"');
  });
});
