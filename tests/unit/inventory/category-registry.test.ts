import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { CategoryRegistry } from '../../../src/domain/categories';
import {
  parseMachineManifest,
  readMachineManifest,
} from '../../../src/infrastructure/manifest-reader';

describe('inventory category registry', () => {
  test('preserves stable public category metadata from the machine manifest', () => {
    const manifest = parseMachineManifest({
      version: 1,
      categories: [
        { id: 'applications', label: 'Applications' },
        { id: 'runtimes', label: 'Runtimes' },
        { id: 'managers', label: 'Managers' },
        { id: 'shell', label: 'Shell' },
        { id: 'scripts', label: 'Scripts' },
        { id: 'path', label: 'PATH' },
        { id: 'environment', label: 'Environment metadata' },
      ],
    });
    const registry = new CategoryRegistry(manifest.categories);

    expect(registry.list().map((category) => category.id)).toEqual([
      'applications',
      'runtimes',
      'managers',
      'shell',
      'scripts',
      'path',
      'environment',
    ]);
    expect(registry.require('runtimes')).toEqual({ id: 'runtimes', label: 'Runtimes' });
  });

  test('rejects duplicate category identities before providers can collect records', () => {
    expect(
      () =>
        new CategoryRegistry([
          { id: 'runtimes', label: 'Runtimes' },
          { id: 'runtimes', label: 'Other runtimes' },
        ])
    ).toThrow('Duplicate inventory category');
  });

  test('rejects incomplete or reordered manifest category identities', () => {
    expect(() =>
      parseMachineManifest({
        version: 1,
        categories: [
          { id: 'runtimes', label: 'Runtimes' },
          { id: 'applications', label: 'Applications' },
          { id: 'managers', label: 'Managers' },
          { id: 'shell', label: 'Shell' },
          { id: 'scripts', label: 'Scripts' },
          { id: 'path', label: 'PATH' },
          { id: 'environment', label: 'Environment metadata' },
        ],
      })
    ).toThrow('Invalid machine manifest');
  });

  test('returns defensive category copies from the canonical shipped manifest', () => {
    const manifest = readMachineManifest(
      join(import.meta.dir, '..', '..', '..', 'manifests', 'machine-manifest.json')
    );
    const registry = new CategoryRegistry(manifest.categories);
    const listed = registry.list();

    expect(() => {
      listed[0]!.label = 'Changed label';
    }).toThrow();

    expect(manifest.categories.map((category) => category.id)).toEqual([
      'applications',
      'runtimes',
      'managers',
      'shell',
      'scripts',
      'path',
      'environment',
    ]);
    expect(registry.require('applications')).toEqual({ id: 'applications', label: 'Applications' });
  });
});
