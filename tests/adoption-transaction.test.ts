import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyAdoption } from "../src/application/apply-adoption";
import { planAdoption } from "../src/application/plan-adoption";
import { NodeAdoptionFilesystem } from "../src/infrastructure/adoption-filesystem";

const fixtureParent = join(import.meta.dir, ".fixtures");
const fixtures: string[] = [];
const passingPreflight = () => ({ kind: "passed" as const });

function fixture(): string {
  mkdirSync(fixtureParent, { recursive: true });
  const root = mkdtempSync(join(fixtureParent, "adoption-"));
  fixtures.push(root);
  return root;
}

function repository(root: string): string {
  const repositoryRoot = join(root, "repository");
  mkdirSync(join(repositoryRoot, "portable", "zsh"), { recursive: true });
  mkdirSync(join(repositoryRoot, "portable", "zsh", "shims"), { recursive: true });
  writeFileSync(join(repositoryRoot, "package.json"), JSON.stringify({ name: "mzsh", version: "1.2.3" }));
  writeFileSync(join(repositoryRoot, "portable", "zsh", "init.zsh"), "return 0\n");
  return repositoryRoot;
}

function home(root: string): string {
  const value = join(root, "home");
  mkdirSync(join(value, ".config"), { recursive: true });
  return value;
}

function input(homeRoot: string, repositoryRoot: string, legacySource?: string) {
  return { home: homeRoot, repository: repositoryRoot, config: join(homeRoot, ".config"), legacySource };
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("guarded adoption transaction", () => {
  test("plans a pure absolute transaction without writing", () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);

    const result = planAdoption(input(homeRoot, repositoryRoot), { filesystem: new NodeAdoptionFilesystem(), id: () => "tx-1" });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.plan.schema).toBe("mzsh.adoption-plan/v1");
    expect(result.plan.mutations.map((mutation) => mutation.category)).toEqual([
      "loader",
      "loader",
      "loader",
      "private",
      "shims",
      "current",
    ]);
    expect(result.plan.targets.every((target) => target.path.startsWith(homeRoot))).toBe(true);
    expect(lstatSync(join(homeRoot, ".config")).isDirectory()).toBe(true);
    expect(() => lstatSync(join(homeRoot, ".config", "mzsh", "state"))).toThrow();
  });

  test("applies owner-only loaders, links, backups, and a redacted receipt", () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    writeFileSync(join(homeRoot, ".zshrc"), "unaltered-before-adoption\n");
    const planned = planAdoption(input(homeRoot, repositoryRoot), { filesystem: new NodeAdoptionFilesystem(), id: () => "tx-2" });
    if (planned.kind !== "ready") throw new Error("expected plan");

    const result = applyAdoption(planned.plan, { filesystem: new NodeAdoptionFilesystem(), preflight: passingPreflight });
    expect(result).toEqual({ kind: "applied", receiptPath: join(homeRoot, ".config", "mzsh", "state", "tx-2", "receipt.json") });
    expect(lstatSync(join(homeRoot, ".zshrc")).mode & 0o777).toBe(0o600);
    expect(lstatSync(join(homeRoot, ".config", "mzsh", "state", "tx-2")).mode & 0o777).toBe(0o700);
    expect(lstatSync(join(homeRoot, ".config", "mzsh", "current")).isSymbolicLink()).toBe(true);
    const receipt = readFileSync(join(homeRoot, ".config", "mzsh", "state", "tx-2", "receipt.json"), "utf8");
    expect(receipt).toContain('"schema":"mzsh.adoption-receipt/v1"');
    expect(receipt).not.toContain("unaltered-before-adoption");
    expect(receipt).not.toContain("MZSH_API_TOKEN");
  });

  test("rejects containment escapes, unsafe destinations, changed sources, and unsafe private migration", () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    const outside = join(root, "outside");
    mkdirSync(outside);
    rmSync(join(homeRoot, ".config"), { recursive: true });
    symlinkSync(outside, join(homeRoot, ".config"));
    expect(planAdoption(input(homeRoot, repositoryRoot), { filesystem: new NodeAdoptionFilesystem(), id: () => "tx-3" })).toEqual(
      expect.objectContaining({ kind: "rejected", code: "config-root-unsafe" })
    );

    rmSync(join(homeRoot, ".config"), { recursive: true, force: true });
    mkdirSync(join(homeRoot, ".config", "mzsh"), { recursive: true });
    writeFileSync(join(homeRoot, ".config", "mzsh", "private.zsh"), "x\n");
    chmodSync(join(homeRoot, ".config", "mzsh", "private.zsh"), 0o644);
    expect(planAdoption(input(homeRoot, repositoryRoot), { filesystem: new NodeAdoptionFilesystem(), id: () => "tx-4" })).toEqual(
      expect.objectContaining({ kind: "rejected", code: "private-destination-insecure" })
    );

    rmSync(join(homeRoot, ".config", "mzsh", "private.zsh"));
    writeFileSync(join(homeRoot, ".config", "mzsh", "current"), "non-owned-managed-destination\n");
    expect(planAdoption(input(homeRoot, repositoryRoot), { filesystem: new NodeAdoptionFilesystem(), id: () => "tx-4-current" })).toEqual(
      expect.objectContaining({ kind: "rejected", code: "managed-destination-unowned" })
    );
    rmSync(join(homeRoot, ".config", "mzsh", "current"));

    const legacy = join(homeRoot, "legacy.zsh");
    writeFileSync(legacy, "export MZSH_API_TOKEN=inert-placeholder\nkeep=this-line\n");
    const planned = planAdoption(input(homeRoot, repositoryRoot, legacy), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => "tx-5",
      isSensitiveAssignment: (line) => line.startsWith("export MZSH_API_TOKEN="),
    });
    if (planned.kind !== "ready") throw new Error("expected plan");
    writeFileSync(legacy, "changed-after-planning\n");
    expect(applyAdoption(planned.plan, { filesystem: new NodeAdoptionFilesystem(), preflight: passingPreflight })).toEqual(
      expect.objectContaining({ kind: "failed", code: "source-changed" })
    );
    writeFileSync(legacy, "$(unsafe)\n");
    expect(planAdoption(input(homeRoot, repositoryRoot, legacy), { filesystem: new NodeAdoptionFilesystem(), id: () => "tx-6" })).toEqual(
      expect.objectContaining({ kind: "ready" })
    );
  });

  test("rejects symlinked declared roots before planning any transaction", () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const outsideHome = join(root, "outside-home");
    const outsideConfig = join(root, "outside-config");
    mkdirSync(join(outsideHome, ".config"), { recursive: true });
    mkdirSync(outsideConfig);
    const symlinkedHome = join(root, "symlinked-home");
    symlinkSync(outsideHome, symlinkedHome);
    expect(planAdoption(input(symlinkedHome, repositoryRoot), { filesystem: new NodeAdoptionFilesystem(), id: () => "tx-root-home" })).toEqual(
      expect.objectContaining({ kind: "rejected", code: "home-root-unsafe" })
    );

    const homeRoot = home(root);
    rmSync(join(homeRoot, ".config"), { recursive: true, force: true });
    symlinkSync(outsideConfig, join(homeRoot, ".config"));
    expect(planAdoption(input(homeRoot, repositoryRoot), { filesystem: new NodeAdoptionFilesystem(), id: () => "tx-root-config" })).toEqual(
      expect.objectContaining({ kind: "rejected", code: "config-root-unsafe" })
    );
  });

  test("rejects overlapping legacy sources and unsupported loader objects before writes", () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    for (const legacySource of [
      join(homeRoot, ".zshenv"),
      join(homeRoot, ".zprofile"),
      join(homeRoot, ".zshrc"),
      join(homeRoot, ".config", "mzsh", "private.zsh"),
      join(homeRoot, ".config", "mzsh", "shims"),
      join(homeRoot, ".config", "mzsh", "current"),
    ]) {
      expect(planAdoption(input(homeRoot, repositoryRoot, legacySource), { filesystem: new NodeAdoptionFilesystem(), id: () => `tx-overlap-${legacySource.length}` })).toEqual(
        expect.objectContaining({ kind: "rejected", code: "legacy-source-overlaps-target" })
      );
    }
    mkdirSync(join(homeRoot, ".zshenv"));
    expect(planAdoption(input(homeRoot, repositoryRoot), { filesystem: new NodeAdoptionFilesystem(), id: () => "tx-loader-directory" })).toEqual(
      expect.objectContaining({ kind: "rejected", code: "loader-destination-unsafe" })
    );
    expect(() => lstatSync(join(homeRoot, ".config", "mzsh", "state", "tx-loader-directory"))).toThrow();

    class FifoLoaderFilesystem extends NodeAdoptionFilesystem {
      override describe(path: string) {
        return path === join(homeRoot, ".zprofile") ? { path, kind: "other" as const, mode: 0o600, ownerId: this.currentUserId() } : super.describe(path);
      }
    }
    expect(planAdoption(input(homeRoot, repositoryRoot), { filesystem: new FifoLoaderFilesystem(), id: () => "tx-loader-fifo" })).toEqual(
      expect.objectContaining({ kind: "rejected", code: "loader-destination-unsafe" })
    );
    expect(() => lstatSync(join(homeRoot, ".config", "mzsh", "state", "tx-loader-fifo"))).toThrow();
  });

  test("preserves a replacement temporary entry after atomic file or link creation fails", () => {
    const root = fixture();
    const directory = join(root, "atomic");
    mkdirSync(directory);
    const fileTemp = join(directory, ".file.replace-file.mzsh-tmp");
    const linkTemp = join(directory, ".link.replace-link.mzsh-tmp");
    const fileFilesystem = new NodeAdoptionFilesystem(
      () => "replace-file",
      undefined,
      (temporary) => {
        unlinkSync(temporary);
        writeFileSync(temporary, "other-actor-file\n");
        throw new Error("after-create");
      }
    );
    expect(() => fileFilesystem.writeAtomic(join(directory, "file"), "managed\n")).toThrow("after-create");
    expect(readFileSync(fileTemp, "utf8")).toBe("other-actor-file\n");

    const linkFilesystem = new NodeAdoptionFilesystem(
      () => "replace-link",
      undefined,
      (temporary) => {
        unlinkSync(temporary);
        writeFileSync(temporary, "other-actor-link\n");
        throw new Error("after-create");
      }
    );
    expect(() => linkFilesystem.linkAtomic(join(directory, "link"), "target")).toThrow("after-create");
    expect(readFileSync(linkTemp, "utf8")).toBe("other-actor-link\n");

    chmodSync(directory, 0o777);
    expect(() => new NodeAdoptionFilesystem().writeAtomic(join(directory, "unsafe-parent"), "managed\n")).toThrow("unsafe atomic parent");
    expect(() => lstatSync(join(directory, "unsafe-parent"))).toThrow();
  });

  test("uses one no-follow legacy snapshot and restores when it changes before legacy rewrite", () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    const legacy = join(homeRoot, "legacy.zsh");
    writeFileSync(legacy, "export MZSH_API_TOKEN=inert-placeholder\nkeep=this-line\n");
    const planned = planAdoption(input(homeRoot, repositoryRoot, legacy), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => "tx-snapshot",
      isSensitiveAssignment: (line) => line.startsWith("export MZSH_API_TOKEN="),
    });
    if (planned.kind !== "ready") throw new Error("expected plan");

    expect(
      applyAdoption(planned.plan, {
        filesystem: new NodeAdoptionFilesystem(),
        preflight: passingPreflight,
        beforeMutation: (category) => {
          if (category === "legacy") writeFileSync(legacy, "replaced-between-private-and-legacy\n");
        },
      })
    ).toEqual(expect.objectContaining({ kind: "failed", code: "source-changed" }));
    expect(() => lstatSync(join(homeRoot, ".config", "mzsh", "state", "tx-snapshot", "receipt.json"))).toThrow();
    expect(() => lstatSync(join(homeRoot, ".config", "mzsh", "private.zsh"))).toThrow();
    expect(readFileSync(legacy, "utf8")).toBe("replaced-between-private-and-legacy\n");
  });

  test("migrates only classified assignment lines without placing them in receipt metadata", () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    const legacy = join(homeRoot, "legacy.zsh");
    writeFileSync(legacy, "# preserved\nexport MZSH_API_TOKEN=inert-placeholder\nexport PATH=/safe/bin\n");
    const planned = planAdoption(input(homeRoot, repositoryRoot, legacy), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => "tx-7",
      isSensitiveAssignment: (line) => line.startsWith("export MZSH_API_TOKEN="),
    });
    if (planned.kind !== "ready") throw new Error("expected plan");

    expect(applyAdoption(planned.plan, { filesystem: new NodeAdoptionFilesystem(), preflight: passingPreflight }).kind).toBe("applied");
    expect(readFileSync(legacy, "utf8")).toBe("# preserved\nexport PATH=/safe/bin\n");
    expect(readFileSync(join(homeRoot, ".config", "mzsh", "private.zsh"), "utf8")).toContain("inert-placeholder");
    const receipt = readFileSync(join(homeRoot, ".config", "mzsh", "state", "tx-7", "receipt.json"), "utf8");
    expect(receipt).not.toContain("inert-placeholder");
  });

  test("preserves an existing secure private file and rejects a foreign-owned destination", () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    const privatePath = join(homeRoot, ".config", "mzsh", "private.zsh");
    mkdirSync(join(homeRoot, ".config", "mzsh"), { recursive: true });
    writeFileSync(privatePath, "existing-private-line\n");
    chmodSync(privatePath, 0o600);
    const legacy = join(homeRoot, "legacy.zsh");
    writeFileSync(legacy, "export MZSH_API_TOKEN=inert-placeholder\n");
    const planned = planAdoption(input(homeRoot, repositoryRoot, legacy), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => "tx-private",
      isSensitiveAssignment: (line) => line.startsWith("export MZSH_API_TOKEN="),
    });
    if (planned.kind !== "ready") throw new Error("expected plan");
    expect(applyAdoption(planned.plan, { filesystem: new NodeAdoptionFilesystem(), preflight: passingPreflight }).kind).toBe("applied");
    expect(readFileSync(privatePath, "utf8")).toBe("existing-private-line\nexport MZSH_API_TOKEN=inert-placeholder\n");

    class ForeignOwnerFilesystem extends NodeAdoptionFilesystem {
      override describe(path: string) {
        const state = super.describe(path);
        return path === privatePath ? { ...state, ownerId: 999999 } : state;
      }
    }
    expect(planAdoption(input(homeRoot, repositoryRoot), { filesystem: new ForeignOwnerFilesystem(), id: () => "tx-foreign" })).toEqual(
      expect.objectContaining({ kind: "rejected", code: "private-destination-foreign-owner" })
    );
  });

  test("restores every mutated target when injected failure occurs before receipt publication", () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    writeFileSync(join(homeRoot, ".zshenv"), "before\n");
    const planned = planAdoption(input(homeRoot, repositoryRoot), { filesystem: new NodeAdoptionFilesystem(), id: () => "tx-8" });
    if (planned.kind !== "ready") throw new Error("expected plan");

    const result = applyAdoption(planned.plan, {
      filesystem: new NodeAdoptionFilesystem(),
      preflight: passingPreflight,
      failAfterMutation: (category) => category === "shims",
    });
    expect(result).toEqual(expect.objectContaining({ kind: "failed", stage: "apply", code: "mutation-failed" }));
    expect(readFileSync(join(homeRoot, ".zshenv"), "utf8")).toBe("before\n");
    expect(() => lstatSync(join(homeRoot, ".config", "mzsh", "current"))).toThrow();
    expect(() => lstatSync(join(homeRoot, ".config", "mzsh", "state", "tx-8", "receipt.json"))).toThrow();
  });

  test("restores transaction state for every mutation category", () => {
    for (const category of ["loader", "private", "legacy", "shims", "current"] as const) {
      const root = fixture();
      const repositoryRoot = repository(root);
      const homeRoot = home(root);
      const legacy = join(homeRoot, "legacy.zsh");
      writeFileSync(join(homeRoot, ".zshenv"), "before-category\n");
      writeFileSync(legacy, "export MZSH_API_TOKEN=inert-placeholder\n");
      const planned = planAdoption(input(homeRoot, repositoryRoot, legacy), {
        filesystem: new NodeAdoptionFilesystem(),
        id: () => `tx-${category}`,
        isSensitiveAssignment: (line) => line.startsWith("export MZSH_API_TOKEN="),
      });
      if (planned.kind !== "ready") throw new Error("expected plan");

      expect(
        applyAdoption(planned.plan, {
          filesystem: new NodeAdoptionFilesystem(),
          preflight: passingPreflight,
          failAfterMutation: (mutated) => mutated === category,
        }).kind
      ).toBe("failed");
      expect(readFileSync(join(homeRoot, ".zshenv"), "utf8")).toBe("before-category\n");
      expect(readFileSync(legacy, "utf8")).toBe("export MZSH_API_TOKEN=inert-placeholder\n");
      expect(() => lstatSync(join(homeRoot, ".config", "mzsh", "current"))).toThrow();
    }
  });

  test("re-plans an already managed topology idempotently", () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    const first = planAdoption(input(homeRoot, repositoryRoot), { filesystem: new NodeAdoptionFilesystem(), id: () => "tx-9" });
    if (first.kind !== "ready") throw new Error("expected plan");
    expect(applyAdoption(first.plan, { filesystem: new NodeAdoptionFilesystem(), preflight: passingPreflight }).kind).toBe("applied");
    const second = planAdoption(input(homeRoot, repositoryRoot), { filesystem: new NodeAdoptionFilesystem(), id: () => "tx-10" });
    expect(second).toEqual(expect.objectContaining({ kind: "ready" }));
  });

  test("preserves the existing home mode and performs injected preflight before any write", () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    chmodSync(homeRoot, 0o755);
    const planned = planAdoption(input(homeRoot, repositoryRoot), { filesystem: new NodeAdoptionFilesystem(), id: () => "tx-preflight" });
    if (planned.kind !== "ready") throw new Error("expected plan");

    expect(
      applyAdoption(planned.plan, {
        filesystem: new NodeAdoptionFilesystem(),
        preflight: () => ({ kind: "failed", code: "isolated-startup-failed" }),
      })
    ).toEqual(expect.objectContaining({ kind: "failed", stage: "preflight", code: "isolated-startup-failed" }));
    expect(lstatSync(homeRoot).mode & 0o777).toBe(0o755);
    expect(() => lstatSync(join(homeRoot, ".config", "mzsh", "state", "tx-preflight"))).toThrow();
  });

  test("fails closed when preflight is missing or throws", () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    const planned = planAdoption(input(homeRoot, repositoryRoot), { filesystem: new NodeAdoptionFilesystem(), id: () => "tx-missing-preflight" });
    if (planned.kind !== "ready") throw new Error("expected plan");

    expect(applyAdoption(planned.plan, { filesystem: new NodeAdoptionFilesystem() })).toEqual(
      expect.objectContaining({ kind: "failed", stage: "preflight", code: "preflight-unavailable" })
    );
    expect(
      applyAdoption(planned.plan, { filesystem: new NodeAdoptionFilesystem(), preflight: () => { throw new Error("injected"); } })
    ).toEqual(expect.objectContaining({ kind: "failed", stage: "preflight", code: "preflight-unavailable" }));
    expect(() => lstatSync(join(homeRoot, ".config", "mzsh", "state", "tx-missing-preflight"))).toThrow();
  });

  test("fails apply when repository entrypoint or metadata changes after planning", () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    const planned = planAdoption(input(homeRoot, repositoryRoot), { filesystem: new NodeAdoptionFilesystem(), id: () => "tx-repository" });
    if (planned.kind !== "ready") throw new Error("expected plan");
    writeFileSync(join(repositoryRoot, "portable", "zsh", "init.zsh"), "changed\n");

    expect(applyAdoption(planned.plan, { filesystem: new NodeAdoptionFilesystem(), preflight: passingPreflight })).toEqual(
      expect.objectContaining({ kind: "failed", stage: "preflight", code: "repository-changed" })
    );
  });

  test("retains unsafe non-selected legacy syntax but rejects an unsafe selected line", () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    const legacy = join(homeRoot, "legacy.zsh");
    writeFileSync(legacy, "export PATH=$(safe-retained-command)\nexport MZSH_API_TOKEN=inert-placeholder\n");
    const retained = planAdoption(input(homeRoot, repositoryRoot, legacy), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => "tx-retained",
      isSensitiveAssignment: (line) => line.startsWith("export MZSH_API_TOKEN="),
    });
    expect(retained).toEqual(expect.objectContaining({ kind: "ready" }));
    const unsafeSelected = planAdoption(input(homeRoot, repositoryRoot, legacy), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => "tx-unsafe",
      isSensitiveAssignment: (line) => line.startsWith("export PATH="),
    });
    expect(unsafeSelected).toEqual(expect.objectContaining({ kind: "rejected", code: "legacy-selected-unsafe" }));
  });

  test("does not follow a hostile temporary symlink and removes a receipt after post-publication failure", () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    const victim = join(root, "victim");
    writeFileSync(victim, "victim-before\n");
    symlinkSync(victim, join(homeRoot, "..zshenv.hostile.mzsh-tmp"));
    const planned = planAdoption(input(homeRoot, repositoryRoot), { filesystem: new NodeAdoptionFilesystem(), id: () => "tx-hostile" });
    if (planned.kind !== "ready") throw new Error("expected plan");

    expect(applyAdoption(planned.plan, { filesystem: new NodeAdoptionFilesystem(() => "hostile"), preflight: passingPreflight })).toEqual(
      expect.objectContaining({ kind: "failed", code: "mutation-failed" })
    );
    expect(readFileSync(victim, "utf8")).toBe("victim-before\n");

    const second = planAdoption(input(homeRoot, repositoryRoot), { filesystem: new NodeAdoptionFilesystem(), id: () => "tx-publication" });
    if (second.kind !== "ready") throw new Error("expected plan");
    expect(
      applyAdoption(second.plan, { filesystem: new NodeAdoptionFilesystem(), preflight: passingPreflight, failAfterReceiptPublication: () => true })
    ).toEqual(expect.objectContaining({ kind: "failed", code: "mutation-failed" }));
    expect(() => lstatSync(join(homeRoot, ".config", "mzsh", "state", "tx-publication", "receipt.json"))).toThrow();
  });

  test("keeps existing parent permissions and writes quiet guarded loader sources", () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    chmodSync(homeRoot, 0o755);
    const planned = planAdoption(input(homeRoot, repositoryRoot), { filesystem: new NodeAdoptionFilesystem(), id: () => "tx-loader" });
    if (planned.kind !== "ready") throw new Error("expected plan");

    expect(applyAdoption(planned.plan, { filesystem: new NodeAdoptionFilesystem(), preflight: passingPreflight }).kind).toBe("applied");
    const loader = readFileSync(join(homeRoot, ".zshrc"), "utf8");
    expect(lstatSync(homeRoot).mode & 0o777).toBe(0o755);
    expect(loader).toContain("[[ ! -r");
    expect(loader).toContain('"mzsh: managed loader unavailable"');
    expect(loader).not.toContain(homeRoot);
    expect(loader).not.toContain(repositoryRoot);
  });

  test("converts metadata failures and post-rename failures into safe transaction results", () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    class ThrowingDescribeFilesystem extends NodeAdoptionFilesystem {
      override describe(): never {
        throw new Error("injected metadata failure");
      }
    }
    expect(planAdoption(input(homeRoot, repositoryRoot), { filesystem: new ThrowingDescribeFilesystem(), id: () => "tx-metadata" })).toEqual(
      expect.objectContaining({ kind: "rejected", code: "metadata-unavailable" })
    );

    const planned = planAdoption(input(homeRoot, repositoryRoot), { filesystem: new NodeAdoptionFilesystem(), id: () => "tx-rename" });
    if (planned.kind !== "ready") throw new Error("expected plan");
    const recreatedTemp = join(homeRoot, "..zshenv.race.mzsh-tmp");
    class PostRenameFailureFilesystem extends NodeAdoptionFilesystem {
      override writeAtomic(path: string, content: string | Uint8Array, mode?: number): void {
        super.writeAtomic(path, content, mode);
        if (path.endsWith(".zshenv")) {
          writeFileSync(recreatedTemp, "other-actor\n");
          throw new Error("injected post-rename failure");
        }
      }
    }
    expect(applyAdoption(planned.plan, { filesystem: new PostRenameFailureFilesystem(() => "race"), preflight: passingPreflight })).toEqual(
      expect.objectContaining({ kind: "failed", code: "mutation-failed" })
    );
    expect(readFileSync(recreatedTemp, "utf8")).toBe("other-actor\n");
    expect(() => lstatSync(join(homeRoot, ".zshenv"))).toThrow();
  });

  test("backs up and restores non-UTF8 file bytes exactly", () => {
    const root = fixture();
    const source = join(root, "binary-source");
    const backupDirectory = join(root, "backup");
    const backup = join(backupDirectory, "source");
    mkdirSync(backupDirectory);
    writeFileSync(source, new Uint8Array([0xff, 0x00, 0xfe, 0x41]));
    const filesystem = new NodeAdoptionFilesystem();
    const state = filesystem.describe(source);
    filesystem.backup(state, backup);
    writeFileSync(source, "changed\n");
    filesystem.restore(state, backup);
    expect([...readFileSync(source)]).toEqual([0xff, 0x00, 0xfe, 0x41]);
  });
});
