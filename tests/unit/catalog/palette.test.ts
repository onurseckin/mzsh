import { expect, test } from 'bun:test';
import { catalog } from '../../../src/catalog/command-catalog';
import { projectCatalogPalette } from '../../../src/catalog/palette';

test('projects risk and availability from catalog metadata for the palette', () => {
  const palette = projectCatalogPalette(catalog);

  expect(palette).toContainEqual({
    command: 'rollback',
    label: 'Restore one recorded adoption transaction.',
    keywords: ['rollback', 'receipt'],
    risk: 'destructive',
    available: true,
  });
  expect(palette).toContainEqual({
    command: 'setup',
    label: 'Set up the managed MZSH lifecycle.',
    keywords: ['setup', 'install'],
    risk: 'destructive',
    available: true,
  });
});
