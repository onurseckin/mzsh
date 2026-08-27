import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PORTABLE_INTERACTIVE_MODULE_ORDER } from '../src/domain/portable-module-order';
import { FileDiscovery } from '../src/fileDiscovery';

const fixtures: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(import.meta.dir, '.fixtures', 'managed-discovery-'));
  fixtures.push(root);
  return root;
}

function write(path: string, content = '# mzsh-managed-loader\n'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('prioritizes managed loaders, the private boundary, and portable modules above legacy context', async () => {
  const home = fixture();
  const config = join(home, 'config');
  write(join(home, '.zshrc'));
  write(join(home, '.zprofile'));
  write(join(config, 'mzsh', 'private.zsh'), 'LOCAL_OVERRIDE=1\n');
  write(join(config, 'mzsh', 'current', 'modules', 'path.zsh'), 'return 0\n');
  write(join(config, 'zsh', 'legacy.zsh'), 'export LEGACY_MODE=1\n');

  const files = await new FileDiscovery(home, config).discoverZshFiles();

  expect(files.map((file) => [file.kind, file.name])).toEqual([
    ['managed-loader', 'Managed loader: .zprofile'],
    ['managed-loader', 'Managed loader: .zshrc'],
    ['private', 'Private boundary: private.zsh'],
    ['managed-module', 'Portable module: path.zsh'],
    ['legacy', 'Legacy migration context: legacy.zsh'],
  ]);
});

test('keeps an unmarked startup file as legacy migration context', async () => {
  const home = fixture();
  write(join(home, '.zshrc'), 'source "$HOME/.config/zsh/legacy.zsh"\n');

  const files = await new FileDiscovery(home, join(home, 'config')).discoverZshFiles();

  expect(files).toEqual([
    expect.objectContaining({
      kind: 'legacy',
      name: 'Legacy migration context: .zshrc',
      isZshrc: true,
    }),
  ]);
});

test('orders known portable modules by the manifest before unknown modules', async () => {
  const home = fixture();
  const config = join(home, 'config');
  const modules = join(config, 'mzsh', 'current', 'modules');
  for (const name of ['search', 'path', 'aliases', 'homebrew', 'future-module']) {
    write(join(modules, `${name}.zsh`), 'return 0\n');
  }

  const files = await new FileDiscovery(home, config).discoverZshFiles();

  expect(files.map((file) => file.name)).toEqual([
    ...PORTABLE_INTERACTIVE_MODULE_ORDER.filter((name) =>
      ['path', 'homebrew', 'aliases', 'search'].includes(name)
    ).map((name) => `Portable module: ${name}.zsh`),
    'Portable module: future-module.zsh',
  ]);
});
