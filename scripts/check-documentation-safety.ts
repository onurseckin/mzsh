import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..');

const scanDirectories = ['docs', 'manifests'];
const scanFiles = [
  'README.md',
  'portable/zsh/README.md',
  'portable/tmux/README.md',
  'portable/wezterm/README.md',
];

const sensitivePatterns: Array<{ name: string; pattern: RegExp }> = [
  { name: 'hardcoded-personal-user-path', pattern: /\/Users\/[a-z0-9_.-]+(?!\/\.{2})/i },
  { name: 'potential-github-pat', pattern: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/ },
  { name: 'potential-slack-token', pattern: /\bxox[baprs]-[A-Za-z0-9-]+\b/ },
  { name: 'potential-stripe-secret', pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{24,}\b/ },
  { name: 'potential-aws-key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    name: 'unredacted-private-key',
    pattern: /-----BEGIN\s+(?:RSA|OPENSSH|EC|DSA)?\s*PRIVATE KEY-----/,
  },
];

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (
      entry === 'node_modules' ||
      entry === '.git' ||
      entry === '.superpowers' ||
      entry === '.fixtures'
    ) {
      continue;
    }
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (stat.isFile() && (extname(entry) === '.md' || extname(entry) === '.json')) {
      results.push(fullPath);
    }
  }
  return results;
}

export function checkDocumentationSafety(): string[] {
  const allFiles = scanDirectories
    .flatMap((dir) => collectFiles(join(repoRoot, dir)))
    .concat(scanFiles.map((file) => join(repoRoot, file)));

  const violations: string[] = [];

  for (const filePath of allFiles) {
    if (filePath.endsWith('mzsh-product-build-handoff.md')) continue;
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      for (const { name, pattern } of sensitivePatterns) {
        if (pattern.test(line)) {
          const relPath = relative(repoRoot, filePath);
          violations.push(`${relPath}:${index + 1} matches safety rule "${name}"`);
        }
      }
    });
  }

  return violations;
}

if (import.meta.main) {
  const violations = checkDocumentationSafety();
  if (violations.length > 0) {
    console.error('Documentation safety violations found:');
    for (const violation of violations) {
      console.error(`  ${violation}`);
    }
    process.exit(1);
  }
  console.log('Documentation safety check passed.');
}
