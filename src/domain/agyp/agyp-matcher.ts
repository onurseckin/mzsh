import type { AccountMetadata } from './agyp-types';

/**
 * Resolves an account query against registry accounts using exact, prefix, and substring matches.
 */
export function matchAccount(
  accounts: AccountMetadata[],
  query: string
): { account: AccountMetadata | null; error?: string } {
  const cleanQuery = query.trim().toLowerCase();

  if (!cleanQuery) {
    return { account: null, error: 'Empty account query specified.' };
  }

  // 1. Exact match
  const exact = accounts.find((a) => a.email.toLowerCase() === cleanQuery);
  if (exact) {
    return { account: exact };
  }

  // 2. Prefix match
  const prefixMatches = accounts.filter((a) => a.email.toLowerCase().startsWith(cleanQuery));
  if (prefixMatches.length === 1 && prefixMatches[0]) {
    return { account: prefixMatches[0] };
  }

  // 3. Substring match
  const substringMatches = accounts.filter((a) => a.email.toLowerCase().includes(cleanQuery));
  if (substringMatches.length === 1 && substringMatches[0]) {
    return { account: substringMatches[0] };
  }

  if (prefixMatches.length > 1) {
    const candidates = prefixMatches.map((a) => a.email).join(', ');
    return {
      account: null,
      error: `Ambiguous account query "${query}". Multiple matches found: ${candidates}`,
    };
  }

  if (substringMatches.length > 1) {
    const candidates = substringMatches.map((a) => a.email).join(', ');
    return {
      account: null,
      error: `Ambiguous account query "${query}". Multiple matches found: ${candidates}`,
    };
  }

  return {
    account: null,
    error: `Account "${query}" not found in vault.`,
  };
}
