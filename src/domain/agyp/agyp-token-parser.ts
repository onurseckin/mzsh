/**
 * Helper functions for extracting email claims from tokens and JWT payloads.
 */

export function extractEmailFromJwt(jwtString: string): string | null {
  const parts = jwtString.trim().split('.');
  if (parts.length >= 2 && parts[1]) {
    try {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const jsonStr = Buffer.from(base64, 'base64').toString('utf8');
      const payload = JSON.parse(jsonStr) as Record<string, unknown>;
      if (typeof payload.email === 'string' && payload.email.includes('@')) {
        return payload.email;
      }
      if (typeof payload.sub === 'string' && payload.sub.includes('@')) {
        return payload.sub;
      }
    } catch {
      // Ignore JWT parse error
    }
  }
  return null;
}

export function extractEmailFromToken(token: string): string | null {
  const trimmed = token.trim();
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof parsed.email === 'string' && parsed.email.includes('@')) {
      return parsed.email;
    }
    if (typeof parsed.id_token === 'string') {
      const email = extractEmailFromJwt(parsed.id_token);
      if (email) return email;
    }
    if (typeof parsed.access_token === 'string') {
      const email = extractEmailFromJwt(parsed.access_token);
      if (email) return email;
    }
  } catch {
    // Not JSON payload
  }
  return extractEmailFromJwt(trimmed);
}
