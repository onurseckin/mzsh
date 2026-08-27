import { afterEach, describe, expect, test } from 'bun:test';
import * as helpers from './adoption-transaction-test-helpers';

const {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
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

describe('adoption transaction mutations', () => {
  test('preserves a replacement temporary entry after atomic file or link creation fails', () => {
    const root = fixture();
    const directory = join(root, 'atomic');
    mkdirSync(directory);
    const fileTemp = join(directory, '.file.replace-file.mzsh-tmp');
    const linkTemp = join(directory, '.link.replace-link.mzsh-tmp');
    const fileFilesystem = new NodeAdoptionFilesystem(
      () => 'replace-file',
      undefined,
      (temporary) => {
        unlinkSync(temporary);
        writeFileSync(temporary, 'other-actor-file\n');
        throw new Error('after-create');
      }
    );
    expect(() => fileFilesystem.writeAtomic(join(directory, 'file'), 'managed\n')).toThrow(
      'after-create'
    );
    expect(readFileSync(fileTemp, 'utf8')).toBe('other-actor-file\n');

    const linkFilesystem = new NodeAdoptionFilesystem(
      () => 'replace-link',
      undefined,
      (temporary) => {
        unlinkSync(temporary);
        writeFileSync(temporary, 'other-actor-link\n');
        throw new Error('after-create');
      }
    );
    expect(() => linkFilesystem.linkAtomic(join(directory, 'link'), 'target')).toThrow(
      'after-create'
    );
    expect(readFileSync(linkTemp, 'utf8')).toBe('other-actor-link\n');

    chmodSync(directory, 0o777);
    expect(() =>
      new NodeAdoptionFilesystem().writeAtomic(join(directory, 'unsafe-parent'), 'managed\n')
    ).toThrow('unsafe atomic parent');
    expect(() => lstatSync(join(directory, 'unsafe-parent'))).toThrow();
  });

  test('uses one no-follow legacy snapshot and restores when it changes before legacy rewrite', () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    const legacy = join(homeRoot, 'legacy.zsh');
    writeFileSync(legacy, 'export MZSH_API_TOKEN=inert-placeholder\nkeep=this-line\n');
    const planned = planAdoption(input(homeRoot, repositoryRoot, legacy), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => 'tx-snapshot',
      isSensitiveAssignment: (line) => line.startsWith('export MZSH_API_TOKEN='),
    });
    if (planned.kind !== 'ready') throw new Error('expected plan');

    expect(
      applyAdoption(planned.plan, {
        filesystem: new NodeAdoptionFilesystem(),
        preflight: passingPreflight,
        beforeMutation: (category) => {
          if (category === 'legacy') writeFileSync(legacy, 'replaced-between-private-and-legacy\n');
        },
      })
    ).toEqual(expect.objectContaining({ kind: 'failed', code: 'source-changed' }));
    expect(() =>
      lstatSync(join(homeRoot, '.config', 'mzsh', 'state', 'tx-snapshot', 'receipt.json'))
    ).toThrow();
    expect(() => lstatSync(join(homeRoot, '.config', 'mzsh', 'private.zsh'))).toThrow();
    expect(readFileSync(legacy, 'utf8')).toBe('replaced-between-private-and-legacy\n');
  });

  test('migrates only classified assignment lines without placing them in receipt metadata', () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    const legacy = join(homeRoot, 'legacy.zsh');
    writeFileSync(
      legacy,
      '# preserved\nexport MZSH_API_TOKEN=inert-placeholder\nexport PATH=/safe/bin\n'
    );
    const planned = planAdoption(input(homeRoot, repositoryRoot, legacy), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => 'tx-7',
      isSensitiveAssignment: (line) => line.startsWith('export MZSH_API_TOKEN='),
    });
    if (planned.kind !== 'ready') throw new Error('expected plan');

    expect(
      applyAdoption(planned.plan, {
        filesystem: new NodeAdoptionFilesystem(),
        preflight: passingPreflight,
      }).kind
    ).toBe('applied');
    expect(readFileSync(legacy, 'utf8')).toBe('# preserved\nexport PATH=/safe/bin\n');
    expect(readFileSync(join(homeRoot, '.config', 'mzsh', 'private.zsh'), 'utf8')).toContain(
      'inert-placeholder'
    );
    const receipt = readFileSync(
      join(homeRoot, '.config', 'mzsh', 'state', 'tx-7', 'receipt.json'),
      'utf8'
    );
    expect(receipt).not.toContain('inert-placeholder');
  });

  test('preserves an existing secure private file and rejects a foreign-owned destination', () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    const privatePath = join(homeRoot, '.config', 'mzsh', 'private.zsh');
    mkdirSync(join(homeRoot, '.config', 'mzsh'), { recursive: true });
    writeFileSync(privatePath, 'existing-private-line\n');
    chmodSync(privatePath, 0o600);
    const legacy = join(homeRoot, 'legacy.zsh');
    writeFileSync(legacy, 'export MZSH_API_TOKEN=inert-placeholder\n');
    const planned = planAdoption(input(homeRoot, repositoryRoot, legacy), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => 'tx-private',
      isSensitiveAssignment: (line) => line.startsWith('export MZSH_API_TOKEN='),
    });
    if (planned.kind !== 'ready') throw new Error('expected plan');
    expect(
      applyAdoption(planned.plan, {
        filesystem: new NodeAdoptionFilesystem(),
        preflight: passingPreflight,
      }).kind
    ).toBe('applied');
    expect(readFileSync(privatePath, 'utf8')).toBe(
      'existing-private-line\nexport MZSH_API_TOKEN=inert-placeholder\n'
    );

    class ForeignOwnerFilesystem extends NodeAdoptionFilesystem {
      override describe(path: string) {
        const state = super.describe(path);
        return path === privatePath ? { ...state, ownerId: 999999 } : state;
      }
    }
    expect(
      planAdoption(input(homeRoot, repositoryRoot), {
        filesystem: new ForeignOwnerFilesystem(),
        id: () => 'tx-foreign',
      })
    ).toEqual(
      expect.objectContaining({ kind: 'rejected', code: 'private-destination-foreign-owner' })
    );
  });

  test('restores every mutated target when injected failure occurs before receipt publication', () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    writeFileSync(join(homeRoot, '.zshenv'), 'before\n');
    const planned = planAdoption(input(homeRoot, repositoryRoot), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => 'tx-8',
    });
    if (planned.kind !== 'ready') throw new Error('expected plan');

    const result = applyAdoption(planned.plan, {
      filesystem: new NodeAdoptionFilesystem(),
      preflight: passingPreflight,
      failAfterMutation: (category) => category === 'shims',
    });
    expect(result).toEqual(
      expect.objectContaining({ kind: 'failed', stage: 'apply', code: 'mutation-failed' })
    );
    expect(readFileSync(join(homeRoot, '.zshenv'), 'utf8')).toBe('before\n');
    expect(() => lstatSync(join(homeRoot, '.config', 'mzsh', 'current'))).toThrow();
    expect(() =>
      lstatSync(join(homeRoot, '.config', 'mzsh', 'state', 'tx-8', 'receipt.json'))
    ).toThrow();
  });

  test('restores transaction state for every mutation category', () => {
    for (const category of ['loader', 'private', 'legacy', 'shims', 'current'] as const) {
      const root = fixture();
      const repositoryRoot = repository(root);
      const homeRoot = home(root);
      const legacy = join(homeRoot, 'legacy.zsh');
      writeFileSync(join(homeRoot, '.zshenv'), 'before-category\n');
      writeFileSync(legacy, 'export MZSH_API_TOKEN=inert-placeholder\n');
      const planned = planAdoption(input(homeRoot, repositoryRoot, legacy), {
        filesystem: new NodeAdoptionFilesystem(),
        id: () => `tx-${category}`,
        isSensitiveAssignment: (line) => line.startsWith('export MZSH_API_TOKEN='),
      });
      if (planned.kind !== 'ready') throw new Error('expected plan');

      expect(
        applyAdoption(planned.plan, {
          filesystem: new NodeAdoptionFilesystem(),
          preflight: passingPreflight,
          failAfterMutation: (mutated) => mutated === category,
        }).kind
      ).toBe('failed');
      expect(readFileSync(join(homeRoot, '.zshenv'), 'utf8')).toBe('before-category\n');
      expect(readFileSync(legacy, 'utf8')).toBe('export MZSH_API_TOKEN=inert-placeholder\n');
      expect(() => lstatSync(join(homeRoot, '.config', 'mzsh', 'current'))).toThrow();
    }
  });
});
