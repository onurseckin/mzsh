import { isAbsolute } from "node:path";

export type ManagedCommand = { kind: "audit"; source?: string; json: boolean } | { kind: "bootstrap"; source: string; legacySource?: string; apply: boolean } | { kind: "update"; source?: string; apply: boolean } | { kind: "rollback"; receiptId: string; apply: boolean };
export type ParsedArguments = ManagedCommand | { kind: "usage-error"; code: string } | { kind: "retired" } | { kind: "unmanaged" };
const retired = new Set(["--update", "--reinstall", "--uninst"]);

export function parseArguments(args: readonly string[]): ParsedArguments {
  if (args.some((arg) => retired.has(arg))) return { kind: "retired" };
  const command = args[0]; if (command === undefined) return { kind: "unmanaged" };
  if (!["audit", "bootstrap", "update", "rollback"].includes(command)) return { kind: "usage-error", code: "unknown-command" };
  let source: string | undefined; let legacySource: string | undefined; let json = false; let apply = false; let receiptId: string | undefined;
  for (let index = 1; index < args.length; index += 1) {
    const token = args[index]!;
    if (token === "--apply") { if (apply || command === "audit") return { kind: "usage-error", code: "invalid-flags" }; apply = true; continue; }
    if (token === "--json") { if (json || command !== "audit") return { kind: "usage-error", code: "invalid-flags" }; json = true; continue; }
    if (token === "--source" || token === "--legacy-source") {
      if (token === "--source" && command === "rollback") return { kind: "usage-error", code: "invalid-flags" };
      const next = args[index + 1]; if (next === undefined || next.startsWith("-") || !isAbsolute(next)) return { kind: "usage-error", code: "absolute-path-required" };
      if (token === "--source") { if (source !== undefined) return { kind: "usage-error", code: "duplicate-flag" }; source = next; }
      else { if (command !== "bootstrap") return { kind: "usage-error", code: "invalid-flags" }; if (legacySource !== undefined) return { kind: "usage-error", code: "duplicate-flag" }; legacySource = next; }
      index += 1; continue;
    }
    if (token.startsWith("-")) return { kind: "usage-error", code: "unknown-flag" };
    if (command !== "rollback" || receiptId !== undefined) return { kind: "usage-error", code: "unexpected-positional" };
    receiptId = token;
  }
  if (command === "audit") return { kind: "audit", ...(source === undefined ? {} : { source }), json };
  if (command === "bootstrap") return source === undefined ? { kind: "usage-error", code: "source-required" } : { kind: "bootstrap", source, ...(legacySource === undefined ? {} : { legacySource }), apply };
  if (command === "update") return { kind: "update", ...(source === undefined ? {} : { source }), apply };
  return receiptId === undefined || !/^[A-Za-z0-9_-]+$/.test(receiptId) ? { kind: "usage-error", code: "receipt-id-invalid" } : { kind: "rollback", receiptId, apply };
}
