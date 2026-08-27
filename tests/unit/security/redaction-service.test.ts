import { describe, expect, test } from 'bun:test';
import { RedactionService } from '../../../src/application/redaction-service';
import { redactRecord } from '../../../src/domain/redaction';
import { gatewayRedactionRegistry } from '../../../src/infrastructure/gateway-redaction-registry';
import { gatewayRedactionEvidence } from './gateway-redaction-evidence';

describe('redaction service', () => {
  test('redacts a prefix-matched environment entry without retaining its value', () => {
    const redactor = new RedactionService(gatewayRedactionRegistry);
    const record = redactor.redact({ name: 'SERVICE_TOKEN', value: 'private' });

    expect(record).toEqual({ name: 'SERVICE_TOKEN', value: '[REDACTED]' });
    expect(JSON.stringify({ records: [record] })).not.toContain('private');
  });

  test('retains only names-only gateway provenance for redaction policy', () => {
    const record = redactRecord({ name: 'SERVICE_TOKEN', value: 'private' });

    expect(gatewayRedactionRegistry.provenance).toEqual(gatewayRedactionEvidence);
    expect(JSON.stringify(gatewayRedactionRegistry)).not.toContain('private');
    expect(record.value).toBe('[REDACTED]');
  });
});
