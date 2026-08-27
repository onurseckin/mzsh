import { afterEach, describe, expect, test } from 'bun:test';
import * as helpers from './adoption-transaction-test-helpers';

const {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  join,
  applyAdoption,
  planAdoption,
  NodeAdoptionFilesystem,
  passingPreflight,
  fixture,
  repository,
  home,
  input,
} = helpers;
afterEach(helpers.cleanupFixtures);

describe('adoption transaction planning', () => {
  test('plans a pure absolute transaction without writing', () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);

    const result = planAdoption(input(homeRoot, repositoryRoot), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => 'tx-1',
    });

    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    expect(result.plan.schema).toBe('mzsh.adoption-plan/v1');
    expect(result.plan.mutations.map((mutation) => mutation.category)).toEqual([
      'loader',
      'loader',
      'loader',
      'private',
      'shims',
      'current',
    ]);
    expect(result.plan.targets.every((target) => target.path.startsWith(homeRoot))).toBe(true);
    expect(lstatSync(join(homeRoot, '.config')).isDirectory()).toBe(true);
    expect(() => lstatSync(join(homeRoot, '.config', 'mzsh', 'state'))).toThrow();
  });

  test('applies owner-only loaders, links, backups, and a redacted receipt', () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    writeFileSync(join(homeRoot, '.zshrc'), 'unaltered-before-adoption\n');
    const planned = planAdoption(input(homeRoot, repositoryRoot), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => 'tx-2',
    });
    if (planned.kind !== 'ready') throw new Error('expected plan');

    const result = applyAdoption(planned.plan, {
      filesystem: new NodeAdoptionFilesystem(),
      preflight: passingPreflight,
    });
    expect(result).toEqual({
      kind: 'applied',
      receiptPath: join(homeRoot, '.config', 'mzsh', 'state', 'tx-2', 'receipt.json'),
    });
    expect(lstatSync(join(homeRoot, '.zshrc')).mode & 0o777).toBe(0o600);
    expect(lstatSync(join(homeRoot, '.config', 'mzsh', 'state', 'tx-2')).mode & 0o777).toBe(0o700);
    expect(lstatSync(join(homeRoot, '.config', 'mzsh', 'current')).isSymbolicLink()).toBe(true);
    const receipt = readFileSync(
      join(homeRoot, '.config', 'mzsh', 'state', 'tx-2', 'receipt.json'),
      'utf8'
    );
    expect(receipt).toContain('"schema":"mzsh.adoption-receipt/v1"');
    expect(receipt).not.toContain('unaltered-before-adoption');
    expect(receipt).not.toContain('MZSH_API_TOKEN');
  });

  test('rejects containment escapes, unsafe destinations, changed sources, and unsafe private migration', () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    const outside = join(root, 'outside');
    mkdirSync(outside);
    rmSync(join(homeRoot, '.config'), { recursive: true });
    symlinkSync(outside, join(homeRoot, '.config'));
    expect(
      planAdoption(input(homeRoot, repositoryRoot), {
        filesystem: new NodeAdoptionFilesystem(),
        id: () => 'tx-3',
      })
    ).toEqual(expect.objectContaining({ kind: 'rejected', code: 'config-root-unsafe' }));

    rmSync(join(homeRoot, '.config'), { recursive: true, force: true });
    mkdirSync(join(homeRoot, '.config', 'mzsh'), { recursive: true });
    writeFileSync(join(homeRoot, '.config', 'mzsh', 'private.zsh'), 'x\n');
    chmodSync(join(homeRoot, '.config', 'mzsh', 'private.zsh'), 0o644);
    expect(
      planAdoption(input(homeRoot, repositoryRoot), {
        filesystem: new NodeAdoptionFilesystem(),
        id: () => 'tx-4',
      })
    ).toEqual(expect.objectContaining({ kind: 'rejected', code: 'private-destination-insecure' }));

    rmSync(join(homeRoot, '.config', 'mzsh', 'private.zsh'));
    writeFileSync(join(homeRoot, '.config', 'mzsh', 'current'), 'non-owned-managed-destination\n');
    expect(
      planAdoption(input(homeRoot, repositoryRoot), {
        filesystem: new NodeAdoptionFilesystem(),
        id: () => 'tx-4-current',
      })
    ).toEqual(expect.objectContaining({ kind: 'rejected', code: 'managed-destination-unowned' }));
    rmSync(join(homeRoot, '.config', 'mzsh', 'current'));

    const legacy = join(homeRoot, 'legacy.zsh');
    writeFileSync(legacy, 'export MZSH_API_TOKEN=inert-placeholder\nkeep=this-line\n');
    const planned = planAdoption(input(homeRoot, repositoryRoot, legacy), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => 'tx-5',
      isSensitiveAssignment: (line) => line.startsWith('export MZSH_API_TOKEN='),
    });
    if (planned.kind !== 'ready') throw new Error('expected plan');
    writeFileSync(legacy, 'changed-after-planning\n');
    expect(
      applyAdoption(planned.plan, {
        filesystem: new NodeAdoptionFilesystem(),
        preflight: passingPreflight,
      })
    ).toEqual(expect.objectContaining({ kind: 'failed', code: 'source-changed' }));
    writeFileSync(legacy, '$(unsafe)\n');
    expect(
      planAdoption(input(homeRoot, repositoryRoot, legacy), {
        filesystem: new NodeAdoptionFilesystem(),
        id: () => 'tx-6',
      })
    ).toEqual(expect.objectContaining({ kind: 'ready' }));
  });

  test('rejects symlinked declared roots before planning any transaction', () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const outsideHome = join(root, 'outside-home');
    const outsideConfig = join(root, 'outside-config');
    mkdirSync(join(outsideHome, '.config'), { recursive: true });
    mkdirSync(outsideConfig);
    const symlinkedHome = join(root, 'symlinked-home');
    symlinkSync(outsideHome, symlinkedHome);
    expect(
      planAdoption(input(symlinkedHome, repositoryRoot), {
        filesystem: new NodeAdoptionFilesystem(),
        id: () => 'tx-root-home',
      })
    ).toEqual(expect.objectContaining({ kind: 'rejected', code: 'home-root-unsafe' }));

    const homeRoot = home(root);
    rmSync(join(homeRoot, '.config'), { recursive: true, force: true });
    symlinkSync(outsideConfig, join(homeRoot, '.config'));
    expect(
      planAdoption(input(homeRoot, repositoryRoot), {
        filesystem: new NodeAdoptionFilesystem(),
        id: () => 'tx-root-config',
      })
    ).toEqual(expect.objectContaining({ kind: 'rejected', code: 'config-root-unsafe' }));
  });

  test('rejects overlapping legacy sources and unsupported loader objects before writes', () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    for (const legacySource of [
      join(homeRoot, '.zshenv'),
      join(homeRoot, '.zprofile'),
      join(homeRoot, '.zshrc'),
      join(homeRoot, '.config', 'mzsh', 'private.zsh'),
      join(homeRoot, '.config', 'mzsh', 'shims'),
      join(homeRoot, '.config', 'mzsh', 'current'),
    ]) {
      expect(
        planAdoption(input(homeRoot, repositoryRoot, legacySource), {
          filesystem: new NodeAdoptionFilesystem(),
          id: () => `tx-overlap-${legacySource.length}`,
        })
      ).toEqual(
        expect.objectContaining({ kind: 'rejected', code: 'legacy-source-overlaps-target' })
      );
    }
    mkdirSync(join(homeRoot, '.zshenv'));
    expect(
      planAdoption(input(homeRoot, repositoryRoot), {
        filesystem: new NodeAdoptionFilesystem(),
        id: () => 'tx-loader-directory',
      })
    ).toEqual(expect.objectContaining({ kind: 'rejected', code: 'loader-destination-unsafe' }));
    expect(() =>
      lstatSync(join(homeRoot, '.config', 'mzsh', 'state', 'tx-loader-directory'))
    ).toThrow();

    class FifoLoaderFilesystem extends NodeAdoptionFilesystem {
      override describe(path: string) {
        return path === join(homeRoot, '.zprofile')
          ? { path, kind: 'other' as const, mode: 0o600, ownerId: this.currentUserId() }
          : super.describe(path);
      }
    }
    expect(
      planAdoption(input(homeRoot, repositoryRoot), {
        filesystem: new FifoLoaderFilesystem(),
        id: () => 'tx-loader-fifo',
      })
    ).toEqual(expect.objectContaining({ kind: 'rejected', code: 'loader-destination-unsafe' }));
    expect(() => lstatSync(join(homeRoot, '.config', 'mzsh', 'state', 'tx-loader-fifo'))).toThrow();
  });
});
