import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ROOT_TYPE_SCRIPT_FILES,
  TYPE_SCRIPT_DIRECTORIES,
  collectTypeScriptLineLimitViolations,
} from '../../scripts/check-typescript-line-limits';

const root = resolve(import.meta.dir, '../..');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};

test('routes JavaScript and shell quality checks through compatible compiled tools', () => {
  expect(packageJson.devDependencies.typescript).toBe('7.0.2');
  expect(packageJson.devDependencies.oxlint).toBe('1.80.0');
  expect(packageJson.devDependencies['oxlint-tsgolint']).toBe('7.0.2001');
  expect(packageJson.devDependencies.oxfmt).toBe('0.65.0');
  expect(packageJson.scripts.lint).toContain('oxlint');
  expect(packageJson.scripts.format).toContain('oxfmt');
  expect(packageJson.scripts['shell:check']).toContain('scripts/check-shell-quality.sh');
  const tsconfig = readFileSync(join(root, 'tsconfig.json'), 'utf8');
  expect(tsconfig).toMatch(/"module":\s*"Preserve"/);
  expect(tsconfig).toMatch(/"moduleResolution":\s*"bundler"/);
  expect(tsconfig).toMatch(/"types":\s*\["bun"\]/);
  expect(existsSync(join(root, 'scripts', 'check-shell-quality.sh'))).toBe(true);
  expect(readFileSync(join(root, 'mise.toml'), 'utf8')).toContain('shfmt = "3.12.0"');
  expect(readFileSync(join(root, 'mise.toml'), 'utf8')).toContain('shellcheck = "0.11.0"');
  const shellGate = readFileSync(join(root, 'scripts', 'check-shell-quality.sh'), 'utf8');
  expect(shellGate).toContain('-exec zsh -n');
  expect(shellGate).toContain('shfmt -ln=posix');
  expect(shellGate).toContain('shellcheck -s sh');
  expect(shellGate).not.toContain('shfmt -ln=zsh');
  expect(shellGate).not.toContain('shellcheck -s zsh');
});

test('keeps every regular TypeScript source and test file within the physical line limit', () => {
  expect(packageJson.scripts['line:check']).toBe('bun scripts/check-typescript-line-limits.ts');
  expect(packageJson.scripts['quality:check']).toContain('bun run line:check');
  expect(TYPE_SCRIPT_DIRECTORIES).toEqual(['bin', 'scripts', 'src', 'tests']);
  expect(ROOT_TYPE_SCRIPT_FILES).toEqual(['index.ts']);
  expect(collectTypeScriptLineLimitViolations(root)).toEqual([]);
});
