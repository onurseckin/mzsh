export const redactedValue = '[REDACTED]' as const;

export interface RedactionProvenance {
  readonly source: string;
  readonly revision: string;
}

export interface RedactionRegistry {
  readonly prefixes: readonly string[];
  readonly provenance: RedactionProvenance;
  matches(name: string): boolean;
}

export interface EnvironmentRecord {
  readonly name: string;
  readonly value: string;
}

export interface RedactedEnvironmentRecord {
  readonly name: string;
  readonly value: typeof redactedValue;
}

export interface InteractivePrivateEnvironment {
  listNames(): readonly string[];
  requestSet(name: string): void;
}

export interface InteractivePrivateAssignment {
  readonly name: string;
}

export function redactRecord(value: EnvironmentRecord): RedactedEnvironmentRecord {
  return { name: value.name, value: redactedValue };
}

export function isEnvironmentName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}
