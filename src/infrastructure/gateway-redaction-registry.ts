import type { RedactionRegistry } from '../domain/redaction';

const extraction = Object.freeze([
  {
    prefix: 'ACCESS_',
    sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
    ruleId: 'keyword-anchored-secret',
  },
  {
    prefix: 'API_',
    sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
    ruleId: 'keyword-anchored-secret',
  },
  {
    prefix: 'AUTH_',
    sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
    ruleId: 'keyword-anchored-secret',
  },
  {
    prefix: 'AWS_',
    sourcePath: 'src/services/redaction/rules/cloud-providers.ts',
    ruleId: 'aws-secret-context',
  },
  {
    prefix: 'AZURE_',
    sourcePath: 'src/services/redaction/rules/cloud-providers.ts',
    ruleId: 'azure-ad-client-secret-context',
  },
  {
    prefix: 'CF_',
    sourcePath: 'src/services/redaction/rules/cloud-providers.ts',
    ruleId: 'cloudflare-api-token',
  },
  {
    prefix: 'CLOUDFLARE_',
    sourcePath: 'src/services/redaction/rules/cloud-providers.ts',
    ruleId: 'cloudflare-api-token',
  },
  {
    prefix: 'CLIENT_',
    sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
    ruleId: 'keyword-anchored-secret',
  },
  {
    prefix: 'CREDENTIAL_',
    sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
    ruleId: 'long-base64-after-keyword',
  },
  {
    prefix: 'DATABASE_',
    sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
    ruleId: 'extended-keyword-anchored-secret',
  },
  {
    prefix: 'DB_',
    sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
    ruleId: 'extended-keyword-anchored-secret',
  },
  {
    prefix: 'ENCRYPTION_',
    sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
    ruleId: 'keyword-anchored-secret',
  },
  {
    prefix: 'GITHUB_',
    sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
    ruleId: 'env-var-secret-suffix',
  },
  {
    prefix: 'GOOGLE_',
    sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
    ruleId: 'env-var-secret-suffix',
  },
  {
    prefix: 'JWT_',
    sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
    ruleId: 'extended-keyword-anchored-secret',
  },
  {
    prefix: 'PRIVATE_',
    sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
    ruleId: 'keyword-anchored-secret',
  },
  {
    prefix: 'REDIS_',
    sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
    ruleId: 'extended-keyword-anchored-secret',
  },
  {
    prefix: 'SECRET_',
    sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
    ruleId: 'keyword-anchored-secret',
  },
  {
    prefix: 'SERVICE_',
    sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
    ruleId: 'extended-keyword-anchored-secret',
  },
  {
    prefix: 'TOKEN_',
    sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
    ruleId: 'env-var-secret-suffix',
  },
]);
const prefixes = Object.freeze(extraction.map((entry) => entry.prefix));

export const gatewayRedactionRegistry: RedactionRegistry = Object.freeze({
  prefixes,
  provenance: Object.freeze({
    source: 'proxai-gateway',
    revision: 'bb6fe878dd262a963efe6a0336e803356fb4c5a2',
    sourcePath: 'src/services/redaction/rules/index.ts',
    ruleIdentifiers: Object.freeze([
      'keyword-anchored-secret',
      'extended-keyword-anchored-secret',
      'env-var-secret-suffix',
      'aws-secret-context',
      'aws-session-token-context',
      'azure-ad-client-secret-context',
      'cloudflare-api-token',
    ]),
    extraction,
  }),
  matches(name: string): boolean {
    const normalized = name.toUpperCase();
    return prefixes.some((prefix) => normalized.startsWith(prefix));
  },
});
