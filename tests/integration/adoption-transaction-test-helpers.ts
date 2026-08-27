import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
  join,
};
export { applyAdoption } from '../../src/application/apply-adoption';
export { planAdoption } from '../../src/application/plan-adoption';
export { NodeAdoptionFilesystem } from '../../src/infrastructure/adoption-filesystem';

const fixtureParent = join(import.meta.dir, '.fixtures');
const fixtures: string[] = [];
export const passingPreflight = () => ({ kind: 'passed' as const });

export function fixture(): string {
  mkdirSync(fixtureParent, { recursive: true });
  const root = mkdtempSync(join(fixtureParent, 'adoption-'));
  fixtures.push(root);
  return root;
}

export function repository(root: string): string {
  const repositoryRoot = join(root, 'repository');
  mkdirSync(join(repositoryRoot, 'portable', 'zsh'), { recursive: true });
  mkdirSync(join(repositoryRoot, 'portable', 'zsh', 'shims'), { recursive: true });
  writeFileSync(
    join(repositoryRoot, 'package.json'),
    JSON.stringify({ name: 'mzsh', version: '1.2.3' })
  );
  writeFileSync(join(repositoryRoot, 'portable', 'zsh', 'init.zsh'), 'return 0\n');
  return repositoryRoot;
}

export function home(root: string): string {
  const value = join(root, 'home');
  mkdirSync(join(value, '.config'), { recursive: true });
  return value;
}

export function input(homeRoot: string, repositoryRoot: string, legacySource?: string) {
  return {
    home: homeRoot,
    repository: repositoryRoot,
    config: join(homeRoot, '.config'),
    legacySource,
  };
}

export function cleanupFixtures(): void {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
}
