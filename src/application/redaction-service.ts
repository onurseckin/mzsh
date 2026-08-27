import {
  redactRecord,
  type EnvironmentRecord,
  type RedactedEnvironmentRecord,
  type RedactionRegistry,
} from '../domain/redaction';

export class RedactionService {
  constructor(private readonly registry: RedactionRegistry) {}

  redact(value: EnvironmentRecord): RedactedEnvironmentRecord {
    return redactRecord(value);
  }

  matches(name: string): boolean {
    return this.registry.matches(name);
  }

  provenance(): RedactionRegistry['provenance'] {
    return this.registry.provenance;
  }
}
