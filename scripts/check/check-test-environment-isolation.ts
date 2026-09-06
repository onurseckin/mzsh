import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Refuses tests that could reach the real machine.
 *
 * agyp's classes default to the real HOME and the real `/usr/bin/security`.
 * A test that constructs one without arguments would build a sandbox under
 * ~/.agyp and read or write the user's login keychain, which on macOS means
 * GUI password prompts and, at worst, a re-keyed keychain and a lost sign-in.
 */
const TEST_ROOT = 'tests';
const PRELOAD_FILE = 'tests/preload-isolation.ts';
const BUNFIG_FILE = 'bunfig.toml';

const BARE_CONSTRUCTIONS = [
  'new AgypKeychain()',
  'new AgypPaths()',
  'new AgypService()',
  'new AgypQuotaProbe()',
  'new AgypProvisioning(',
];

const FORBIDDEN_LITERALS = ['/usr/bin/security', "'agy'", 'agy models'];

interface Violation {
  path: string;
  line: number;
  detail: string;
}

function collectTestFiles(root: string, directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (entry === 'node_modules' || entry.startsWith('.')) {
      continue;
    }
    if (statSync(path).isDirectory()) {
      files.push(...collectTestFiles(root, path));
    } else if (path.endsWith('.ts') && relative(root, path) !== PRELOAD_FILE) {
      // The preload is the one file allowed to name the real binary: it is
      // what makes that binary harmless to everything else.
      files.push(path);
    }
  }
  return files;
}

function scan(path: string): Violation[] {
  const violations: Violation[] = [];
  const lines = readFileSync(path, 'utf8').split('\n');
  lines.forEach((text, index) => {
    for (const construction of BARE_CONSTRUCTIONS) {
      if (text.includes(construction)) {
        violations.push({
          path,
          line: index + 1,
          detail: `${construction} uses the real home and keychain; pass fake paths and the fake security fixture`,
        });
      }
    }
    for (const literal of FORBIDDEN_LITERALS) {
      if (text.includes(literal)) {
        violations.push({
          path,
          line: index + 1,
          detail: `${literal} must not appear in tests; use tests/fixtures/fake-security.sh or a stub probe`,
        });
      }
    }
  });
  return violations;
}

function checkPreloadWired(): string | null {
  if (!existsSync(PRELOAD_FILE)) {
    return `${PRELOAD_FILE} is missing; tests would run against the real home`;
  }
  if (!existsSync(BUNFIG_FILE) || !readFileSync(BUNFIG_FILE, 'utf8').includes(PRELOAD_FILE)) {
    return `${BUNFIG_FILE} must preload ${PRELOAD_FILE} so every test process starts in a sandbox home`;
  }
  return null;
}

const root = process.cwd();
const violations = collectTestFiles(root, join(root, TEST_ROOT)).flatMap((path) =>
  scan(path).map((violation) => ({ ...violation, path: relative(root, violation.path) }))
);
const wiring = checkPreloadWired();

if (violations.length === 0 && wiring === null) {
  console.log('Test environment isolation check passed.');
  process.exit(0);
}

console.error('Test environment isolation check failed:');
if (wiring !== null) {
  console.error(`- ${wiring}`);
}
for (const violation of violations) {
  console.error(`- ${violation.path}:${violation.line}: ${violation.detail}`);
}
process.exit(1);
