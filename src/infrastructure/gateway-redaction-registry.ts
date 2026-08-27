import type { RedactionRegistry } from '../domain/redaction';

const prefixes = Object.freeze([
  'ACCESS_',
  'API_',
  'AUTH_',
  'AWS_',
  'AZURE_',
  'CF_',
  'CLOUDFLARE_',
  'CLIENT_',
  'CREDENTIAL_',
  'DATABASE_',
  'DB_',
  'ENCRYPTION_',
  'GITHUB_',
  'GOOGLE_',
  'JWT_',
  'PRIVATE_',
  'REDIS_',
  'SECRET_',
  'SERVICE_',
  'TOKEN_',
]);

export const gatewayRedactionRegistry: RedactionRegistry = Object.freeze({
  prefixes,
  provenance: Object.freeze({
    source: 'proxai-gateway',
    revision: 'bb6fe878dd262a963efe6a0336e803356fb4c5a2',
  }),
  matches(name: string): boolean {
    const normalized = name.toUpperCase();
    return prefixes.some((prefix) => normalized.startsWith(prefix));
  },
});
