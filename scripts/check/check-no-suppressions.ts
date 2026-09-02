import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../..');

const targetDirs = ['src', 'tests', 'scripts'];
const targetExtensions = ['.ts', '.tsx', '.zsh', '.sh'];

const forbiddenPatterns: Array<{ name: string; pattern: RegExp }> = [
  { name: '@ts-ignore', pattern: /@ts-ignore/ },
  { name: '@ts-expect-error', pattern: /@ts-expect-error/ },
  { name: '@ts-nocheck', pattern: /@ts-nocheck/ },
  { name: 'eslint-disable', pattern: /eslint-disable/ },
  { name: 'oxlint-disable', pattern: /oxlint-disable/ },
  { name: 'v8 ignore', pattern: /v8 ignore/ },
  { name: 'istanbul ignore', pattern: /istanbul ignore/ },
  { name: ': any', pattern: /:\s*any\b/ },
  { name: 'as any', pattern: /\bas\s+any\b/ },
  { name: '<any>', pattern: /<any>/ },
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
    } else if (stat.isFile() && targetExtensions.includes(extname(entry))) {
      results.push(fullPath);
    }
  }
  return results;
}

export function checkNoSuppressions(): string[] {
  const allFiles = targetDirs.flatMap((dir) => collectFiles(join(repoRoot, dir)));
  const violations: string[] = [];

  for (const filePath of allFiles) {
    if (filePath.endsWith('check-no-suppressions.ts')) continue;
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      for (const { name, pattern } of forbiddenPatterns) {
        if (pattern.test(line)) {
          const relPath = relative(repoRoot, filePath);
          violations.push(`${relPath}:${index + 1} contains forbidden "${name}"`);
        }
      }
    });
  }

  return violations;
}

if (import.meta.main) {
  const violations = checkNoSuppressions();
  if (violations.length > 0) {
    console.error('Forbidden suppression or type violations found:');
    for (const violation of violations) {
      console.error(`  ${violation}`);
    }
    process.exit(1);
  }
  console.log('No suppression directives or prohibited any types found.');
}
