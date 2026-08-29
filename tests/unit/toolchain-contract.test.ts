import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface PackageManifest {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
}

const root = resolve(import.meta.dir, '../..');

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}

function readManifest(): PackageManifest {
  const value: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

  if (typeof value !== 'object') {
    throw new Error('package.json must be an object');
  }
  if (value === null) {
    throw new Error('package.json must not be null');
  }
  if (!('dependencies' in value)) {
    throw new Error('package.json must declare dependencies');
  }
  if (!('devDependencies' in value)) {
    throw new Error('package.json must declare devDependencies');
  }
  if (!('scripts' in value)) {
    throw new Error('package.json must declare scripts');
  }
  if (!isStringRecord(value.dependencies)) {
    throw new Error('dependencies must be a string record');
  }
  if (!isStringRecord(value.devDependencies)) {
    throw new Error('devDependencies must be a string record');
  }
  if (!isStringRecord(value.scripts)) {
    throw new Error('scripts must be a string record');
  }

  return {
    dependencies: value.dependencies,
    devDependencies: value.devDependencies,
    scripts: value.scripts,
  };
}

test('uses exact stable dependency pins and named validation suites', () => {
  const manifest = readManifest();

  expect(manifest.dependencies.commander).toBe('15.0.0');
  expect(manifest.dependencies.react).toBe('19.2.8');
  expect(manifest.dependencies['@opentui/core']).toBe('0.4.5');
  expect(manifest.dependencies['@opentui/keymap']).toBe('0.4.5');
  expect(manifest.dependencies['@opentui/react']).toBe('0.4.5');
  expect(Object.values(manifest.dependencies)).not.toContainEqual(
    expect.stringMatching(/^[~^]|latest/)
  );
  expect(Object.values(manifest.devDependencies)).not.toContainEqual(
    expect.stringMatching(/^[~^]|latest/)
  );
  expect(manifest.scripts['test:unit']).toBe('bun test --no-isolate tests/unit');
  expect(manifest.scripts['test:integration']).toBe('bun test tests/integration');
  expect(manifest.scripts.validate).toBe(
    'bun run quality:check && bun run build:ts && bun run test:unit && bun run test:integration'
  );
  expect(manifest.scripts.completion).toBe(
    'bun run test:integration --test-name-pattern completion'
  );
  expect(manifest.scripts['shell:check']).toBe('mise exec -- bash scripts/check-shell-quality.sh');
});

test('defines the repository-owned quality and contributor contracts', () => {
  const tsconfig: unknown = JSON.parse(readFileSync(join(root, 'tsconfig.json'), 'utf8'));
  const mise = readFileSync(join(root, 'mise.toml'), 'utf8');
  const lefthook = readFileSync(join(root, 'lefthook.yml'), 'utf8');

  expect(tsconfig).toMatchObject({
    compilerOptions: {
      jsx: 'react-jsx',
    },
  });
  expect(existsSync(join(root, 'lefthook.yml'))).toBe(true);
  expect(existsSync(join(root, 'AGENTS.md'))).toBe(true);
  expect(existsSync(join(root, '.agents', 'contributing.md'))).toBe(true);
  expect(existsSync(join(root, '.agents', 'safety.md'))).toBe(true);
  expect(existsSync(join(root, '.cursor'))).toBe(false);
  expect(mise).toMatch(/^bun\s*=\s*"1\.4\.0"$/m);
  expect(mise).toMatch(/^lefthook\s*=\s*"2\.1\.10"$/m);
  expect(lefthook).toMatch(
    /^pre-commit:\n  commands:\n    quality:\n      run: bun run quality:check$/m
  );
});
