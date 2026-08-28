import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { parseCatalogArgs } from '../../../src/catalog/command-catalog';

const repoRoot = resolve(__dirname, '../../..');

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

function normalizeCommand(raw: string): string[][] {
  if (raw.includes('<list|get|set>')) {
    return [
      ['env', 'list'],
      ['env', 'list', '--json'],
      ['env', 'get', 'TOKEN_NAME'],
      ['env', 'get', 'TOKEN_NAME', '--json'],
      ['env', 'set', 'TOKEN_NAME'],
    ];
  }
  const clean = raw
    .replace(/\[|\]/g, '')
    .replace(/"\$PWD"/g, '/mock/abs/path')
    .replace(/\/absolute\/checkout/g, '/mock/abs/checkout')
    .replace(/\/absolute\/file/g, '/mock/abs/file')
    .replace(/receipt-id/g, 'rec_123')
    .replace(/reviewed-plan-id/g, '550e8400-e29b-41d4-a716-446655440000')
    .replace(/APPLY/g, 'APPLY')
    .replace(/category/g, 'runtimes')
    .replace(/name/g, 'TOKEN_NAME')
    .trim();

  const tokens = clean.split(/\s+/).filter((t) => t.length > 0);
  return tokens.length > 0 ? [tokens] : [];
}

function extractDocumentedCommands(): string[][] {
  const mdFiles = collectMarkdownFiles(join(repoRoot, 'docs')).concat([
    join(repoRoot, 'README.md'),
    join(repoRoot, 'portable/zsh/README.md'),
  ]);

  const commandArgsList: string[][] = [];
  const regex = /^\s*(?:#.*)?(?:bun run mzsh --)\s+(.+)$/gm;

  for (const filePath of mdFiles) {
    const content = readFileSync(filePath, 'utf-8');
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(content)) !== null) {
      const commandStr = match[1]?.trim();
      if (
        !commandStr ||
        commandStr.startsWith('<') ||
        commandStr.includes('[options]') ||
        commandStr.startsWith('mzsh')
      ) {
        continue;
      }
      const expanded = normalizeCommand(commandStr);
      for (const cmd of expanded) {
        commandArgsList.push(cmd);
      }
    }
  }
  return commandArgsList;
}

describe('documented command contract', () => {
  test('every documented checkout-local CLI form parses through the catalog', () => {
    const commands = extractDocumentedCommands();
    expect(commands.length).toBeGreaterThan(0);
    for (const args of commands) {
      const result = parseCatalogArgs(args);
      expect({ args, result: result.kind }).not.toEqual({ args, result: 'usage-error' });
    }
  });
});
