import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

const repoRoot = resolve(__dirname, '../../..');

const expectedDocFiles = [
  'README.md',
  'portable/zsh/README.md',
  'docs/architecture/README.md',
  'docs/architecture/documentation-and-safety-portability-design.md',
  'docs/architecture/mzsh-product-decisions.md',
  'docs/architecture/managed-shell-topology.md',
  'docs/architecture/adoption-transactions.md',
  'docs/architecture/cli-and-discovery.md',
  'docs/architecture/safety-shims.md',
  'docs/guide/README.md',
  'docs/guide/new-machine.md',
  'docs/guide/audit-and-read-findings.md',
  'docs/guide/bootstrap-existing-zsh.md',
  'docs/guide/update-a-checkout.md',
  'docs/guide/rollback-and-recovery.md',
  'docs/guide/configure-private-and-runtime-paths.md',
  'docs/guide/configure-completions-and-fzf.md',
  'docs/reference/README.md',
  'docs/reference/cli.md',
  'docs/reference/audit-findings.md',
  'docs/reference/managed-files-and-receipts.md',
  'docs/reference/development-quality.md',
  'docs/decisions/README.md',
  'docs/decisions/001-managed-dotfiles.md',
] as const;

function collectMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.git' || entry === '.superpowers') continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectMarkdownFiles(fullPath));
    } else if (stat.isFile() && extname(entry) === '.md') {
      results.push(fullPath);
    }
  }
  return results;
}

function extractMarkdownLinks(content: string): string[] {
  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  const links: string[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = linkPattern.exec(content)) !== null) {
    const target = match[1];
    if (
      target &&
      !target.startsWith('http://') &&
      !target.startsWith('https://') &&
      !target.startsWith('mailto:')
    ) {
      links.push(target);
    }
  }
  return links;
}

describe('documentation graph', () => {
  test('all required canonical documentation files exist', () => {
    for (const relPath of expectedDocFiles) {
      const fullPath = join(repoRoot, relPath);
      expect(existsSync(fullPath)).toBe(true);
    }
  });

  test('legacy portability guide is removed', () => {
    const legacyPath = join(repoRoot, 'docs/planning/mzsh-portability/README.md');
    expect(existsSync(legacyPath)).toBe(false);
  });

  test('all relative markdown links in docs resolve to existing files', () => {
    const mdFiles = collectMarkdownFiles(join(repoRoot, 'docs')).concat([
      join(repoRoot, 'README.md'),
      join(repoRoot, 'portable/zsh/README.md'),
    ]);

    for (const filePath of mdFiles) {
      const content = readFileSync(filePath, 'utf-8');
      const links = extractMarkdownLinks(content);
      const fileDir = dirname(filePath);

      for (const link of links) {
        const cleanLink = link.split('#')[0];
        if (cleanLink === '') continue;
        const targetPath = resolve(fileDir, cleanLink);
        expect(existsSync(targetPath)).toBe(true);
      }
    }
  });
});
