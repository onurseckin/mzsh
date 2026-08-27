import type { RepositoryState } from "./repository-state";

export type AuditSeverity = "info" | "warning" | "error";
export type AuditRemediationKind = "inspect" | "repair" | "configure";
export type AuditFindingCode =
  | "REPOSITORY_MISSING"
  | "REPOSITORY_INVALID"
  | "PATH_DUPLICATE"
  | "PATH_DIRECTORY_INSECURE"
  | "ZSH_SOURCE_ALL_TOPOLOGY"
  | "MZSH_CURRENT_LINK_ABSENT"
  | "MZSH_CURRENT_LINK_BROKEN"
  | "PRIVATE_FILE_ABSENT"
  | "PRIVATE_FILE_INSECURE"
  | "PRIVATE_FILE_SYMLINK"
  | "PRIVATE_FILE_NON_REGULAR"
  | "PRIVATE_FILE_FOREIGN_OWNER"
  | "PRIVATE_FILE_SECURE"
  | "NODE_OWNERSHIP_CONFLICT"
  | "PNPM_GLOBAL_BIN_UNDISCOVERABLE"
  | "JAVA_NOT_DISCOVERED"
  | "OPTIONAL_TOOL_ABSENT"
  | "PROBE_FAILED";

export interface AuditRemediation {
  kind: AuditRemediationKind;
  summary: string;
}

export interface AuditFinding {
  code: AuditFindingCode;
  severity: AuditSeverity;
  message: string;
  remediation: AuditRemediation;
}

export interface PathEntryMetadata {
  path: string;
  mode?: number;
}

export interface PrivateFileMetadata {
  kind: "absent" | "file" | "symlink" | "other";
  mode?: number;
  ownerId?: number;
  currentUserId?: number;
  assignmentCount: number;
}

export interface CommandMetadata {
  name: "node" | "pnpm" | "java";
  status: "present" | "absent";
  executablePath?: string;
  version?: string;
}

export type AuditProbeName =
  | "zsh-topology"
  | "private-file"
  | "managed-link"
  | "repository-state"
  | "command-node"
  | "command-pnpm"
  | "command-java"
  | "pnpm-global-bin"
  | "java-home"
  | "homebrew-node";

export interface EnvironmentSnapshot {
  roots: {
    home: string;
    xdgConfig: string;
    xdgCache: string;
    repository: string;
  };
  repository: RepositoryState;
  pathEntries: readonly PathEntryMetadata[];
  zshTopology: "source-all" | "modular" | "unknown";
  currentLink: "valid" | "absent" | "broken";
  privateFile: PrivateFileMetadata;
  nodeOwnership: {
    nvmInteractive: boolean;
    homebrewPrivateNode: boolean;
  };
  pnpm: {
    status: "present" | "absent";
    globalBinDiscoverable: boolean;
  };
  java: {
    status: "discovered" | "not-discovered" | "not-applicable";
  };
  commands: readonly CommandMetadata[];
  probeFailures: readonly AuditProbeName[];
}

export interface EnvironmentAuditReport {
  version: 1;
  roots: EnvironmentSnapshot["roots"];
  repository: RepositoryState;
  findings: readonly AuditFinding[];
}
