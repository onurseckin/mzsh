export const gatewayRedactionEvidence = {
  source: 'proxai-gateway',
  revision: 'bb6fe878dd262a963efe6a0336e803356fb4c5a2',
  sourcePath: 'src/services/redaction/rules/index.ts',
  ruleIdentifiers: [
    'keyword-anchored-secret',
    'extended-keyword-anchored-secret',
    'env-var-secret-suffix',
    'long-base64-after-keyword',
    'bearer-token-keyword-anchored',
    'aws-secret-context',
    'aws-session-token-context',
    'azure-ad-client-secret-context',
    'cloudflare-api-token',
    'cloudflare-global-api-key',
  ],
  extraction: [
    {
      prefix: 'ACCESS_',
      sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
      ruleId: 'keyword-anchored-secret',
    },
    {
      prefix: 'ACCESS_',
      sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
      ruleId: 'bearer-token-keyword-anchored',
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
      prefix: 'AWS_',
      sourcePath: 'src/services/redaction/rules/cloud-providers.ts',
      ruleId: 'aws-session-token-context',
    },
    {
      prefix: 'AZURE_',
      sourcePath: 'src/services/redaction/rules/cloud-providers.ts',
      ruleId: 'azure-ad-client-secret-context',
    },
    {
      prefix: 'BEARER_',
      sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
      ruleId: 'bearer-token-keyword-anchored',
    },
    {
      prefix: 'CERTIFICATE_',
      sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
      ruleId: 'long-base64-after-keyword',
    },
    {
      prefix: 'CERT_',
      sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
      ruleId: 'long-base64-after-keyword',
    },
    {
      prefix: 'CF_',
      sourcePath: 'src/services/redaction/rules/cloud-providers.ts',
      ruleId: 'cloudflare-api-token',
    },
    {
      prefix: 'CLIENT_',
      sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
      ruleId: 'keyword-anchored-secret',
    },
    {
      prefix: 'CLOUDFLARE_',
      sourcePath: 'src/services/redaction/rules/cloud-providers.ts',
      ruleId: 'cloudflare-api-token',
    },
    {
      prefix: 'CLOUDFLARE_',
      sourcePath: 'src/services/redaction/rules/cloud-providers.ts',
      ruleId: 'cloudflare-global-api-key',
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
      prefix: 'HMAC_',
      sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
      ruleId: 'long-base64-after-keyword',
    },
    {
      prefix: 'ID_',
      sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
      ruleId: 'bearer-token-keyword-anchored',
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
      prefix: 'SALT_',
      sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
      ruleId: 'long-base64-after-keyword',
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
      prefix: 'SIGNATURE_',
      sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
      ruleId: 'long-base64-after-keyword',
    },
    {
      prefix: 'TOKEN_',
      sourcePath: 'src/services/redaction/rules/keyword-secret.ts',
      ruleId: 'env-var-secret-suffix',
    },
  ],
} as const;
