import type { RedactedEnvironmentRecord } from '../domain/redaction';
import {
  isEnvironmentName,
  type InteractivePrivateAssignment,
  type InteractivePrivateEnvironment,
} from '../domain/redaction';
import { RedactionService } from './redaction-service';

export class EnvironmentService {
  constructor(
    private readonly boundary: InteractivePrivateEnvironment,
    private readonly redactor: RedactionService
  ) {}

  list(): readonly RedactedEnvironmentRecord[] {
    return this.boundary.listNames().flatMap((name) => {
      const metadata = this.metadata(name);
      return metadata === undefined ? [] : [metadata];
    });
  }

  get(name: string): RedactedEnvironmentRecord | undefined {
    return this.boundary.listNames().includes(name) ? this.metadata(name) : undefined;
  }

  set(input: InteractivePrivateAssignment): RedactedEnvironmentRecord {
    if (!isEnvironmentName(input.name)) throw new Error('PRIVATE_ENVIRONMENT_NAME_INVALID');
    this.boundary.requestSet(input.name);
    return this.redactor.redact({ name: input.name, value: '' });
  }

  private metadata(name: string): RedactedEnvironmentRecord | undefined {
    return isEnvironmentName(name) ? this.redactor.redact({ name, value: '' }) : undefined;
  }
}
