import { accessSync, constants, existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { RepositoryInvalidCode, RepositoryState } from "../domain/repository-state";

const expectedPackageName = "mzsh";

function invalid(root: string, code: RepositoryInvalidCode, message: string): RepositoryState {
  return { kind: "invalid", root, code, message };
}

function hasExpectedPackageName(value: unknown): value is { name: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof (value as { name?: unknown }).name === "string"
  );
}

export class LocalRepository {
  inspect(root: string): RepositoryState {
    if (!isAbsolute(root)) {
      return invalid(
        root,
        "repository-root-not-absolute",
        "Repository inspection requires an absolute root path."
      );
    }

    if (!existsSync(root)) {
      return { kind: "missing", root, reason: "root-absent" };
    }

    try {
      if (!statSync(root).isDirectory()) {
        return invalid(root, "repository-root-not-directory", "Repository root is not a directory.");
      }
    } catch {
      return invalid(root, "repository-root-not-directory", "Repository root is not readable.");
    }

    const packagePath = join(root, "package.json");
    if (!existsSync(packagePath)) {
      return invalid(root, "package-metadata-missing", "MZSH package metadata is missing.");
    }

    let packageMetadata: unknown;
    try {
      packageMetadata = JSON.parse(readFileSync(packagePath, "utf8")) as unknown;
    } catch {
      return invalid(root, "package-metadata-invalid", "MZSH package metadata is unreadable or invalid.");
    }

    if (!hasExpectedPackageName(packageMetadata)) {
      return invalid(root, "package-metadata-invalid", "MZSH package metadata is unreadable or invalid.");
    }
    if (packageMetadata.name !== expectedPackageName) {
      return invalid(root, "package-identity-mismatch", "Repository package identity is not MZSH.");
    }

    const portableEntrypoint = join(root, "portable", "zsh", "init.zsh");
    try {
      if (!statSync(portableEntrypoint).isFile()) {
        return invalid(
          root,
          "portable-entrypoint-missing",
          "The portable Zsh entrypoint is missing or unreadable."
        );
      }
      accessSync(portableEntrypoint, constants.R_OK);
    } catch {
      return invalid(
        root,
        "portable-entrypoint-missing",
        "The portable Zsh entrypoint is missing or unreadable."
      );
    }

    return { kind: "present", root, packageName: expectedPackageName, portableEntrypoint };
  }
}
