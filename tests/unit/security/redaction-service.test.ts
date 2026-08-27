import { describe, expect, test } from 'bun:test';
import { RedactionService } from '../../../src/application/redaction-service';
import { redactRecord } from '../../../src/domain/redaction';
import { gatewayRedactionRegistry } from '../../../src/infrastructure/gateway-redaction-registry';

describe('redaction service', () => {
  test('redacts a prefix-matched environment entry without retaining its value', () => {
    const redactor = new RedactionService(gatewayRedactionRegistry);
    const record = redactor.redact({ name: 'SERVICE_TOKEN', value: 'private' });

    expect(record).toEqual({ name: 'SERVICE_TOKEN', value: '[REDACTED]' });
    expect(JSON.stringify({ records: [record] })).not.toContain('private');
  });

  test('retains only names-only gateway provenance for redaction policy', () => {
    const record = redactRecord({ name: 'SERVICE_TOKEN', value: 'private' });

    expect(gatewayRedactionRegistry.provenance).toEqual({
      source: 'proxai-gateway',
      revision: 'bb6fe878dd262a963efe6a0336e803356fb4c5a2',
      sourcePath: 'src/services/redaction/rules/index.ts',
      ruleIdentifiers: [
        'keyword-anchored-secret',
        'extended-keyword-anchored-secret',
        'env-var-secret-suffix',
        'long-base64-after-keyword',
        'aws-secret-context',
        'aws-session-token-context',
        'azure-ad-client-secret-context',
        'cloudflare-api-token',
        'cloudflare-global-api-key',
      ],
      extraction: expect.arrayContaining([
        {
          prefix: 'SERVICE_',
          sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
          ruleId: 'extended-keyword-anchored-secret',
        },
        {
          prefix: 'AWS_',
          sourcePath: 'src/services/redaction/rules/cloud-providers.ts',
          ruleId: 'aws-secret-context',
        },
      ]),
    });
    expect(JSON.stringify(gatewayRedactionRegistry)).not.toContain('private');
    expect(record.value).toBe('[REDACTED]');
  });

  test('maps every recorded Gateway rule identifier to a names-only prefix extraction', () => {
    const { extraction, ruleIdentifiers } = gatewayRedactionRegistry.provenance;

    expect(new Set(extraction.map((entry) => entry.ruleId))).toEqual(new Set(ruleIdentifiers));
    expect(extraction.filter((entry) => entry.prefix === 'CREDENTIAL_')).toEqual([
      {
        prefix: 'CREDENTIAL_',
        sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
        ruleId: 'long-base64-after-keyword',
      },
    ]);
    expect(
      extraction.filter((entry) => entry.prefix === 'AWS_').map((entry) => entry.ruleId)
    ).toEqual(['aws-secret-context', 'aws-session-token-context']);
    expect(
      extraction.filter((entry) => entry.prefix === 'CLOUDFLARE_').map((entry) => entry.ruleId)
    ).toEqual(['cloudflare-api-token', 'cloudflare-global-api-key']);
  });
});
