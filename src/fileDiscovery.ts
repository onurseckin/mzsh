import * as fs from 'fs-extra';
import * as os from 'os';
import { join } from 'node:path';
import { PORTABLE_INTERACTIVE_MODULE_ORDER } from './domain/portable-module-order';

export type ZshConfigKind = 'managed-loader' | 'private' | 'managed-module' | 'legacy';

export interface ZshFile {
  name: string;
  path: string;
  isZshrc: boolean;
  kind: ZshConfigKind;
}

const loaderNames = ['.zshenv', '.zprofile', '.zshrc'] as const;
const kindOrder: Record<ZshConfigKind, number> = {
  'managed-loader': 0,
  private: 1,
  'managed-module': 2,
  legacy: 3,
};
const portableModuleOrder = new Map<string, number>(
  PORTABLE_INTERACTIVE_MODULE_ORDER.map((name, index) => [name, index])
);

export class FileDiscovery {
  constructor(
    private readonly homeDirectory = os.homedir(),
    private readonly configDirectory = process.env.XDG_CONFIG_HOME ?? join(homeDirectory, '.config')
  ) {}

  async discoverZshFiles(): Promise<ZshFile[]> {
    const managedRoot = join(this.configDirectory, 'mzsh');
    const files = [
      ...(await this.discoverLoaders()),
      ...(await this.discoverPrivateBoundary(managedRoot)),
      ...(await this.discoverPortableModules(managedRoot)),
      ...(await this.discoverLegacyContext()),
    ];

    return files.sort((left, right) => {
      const kindDifference = kindOrder[left.kind] - kindOrder[right.kind];
      if (kindDifference !== 0) return kindDifference;
      if (left.kind !== 'managed-module') return left.name.localeCompare(right.name);
      return this.comparePortableModules(left.name, right.name);
    });
  }

  private comparePortableModules(left: string, right: string): number {
    const leftRank = portableModuleOrder.get(this.portableModuleName(left));
    const rightRank = portableModuleOrder.get(this.portableModuleName(right));
    if (leftRank !== undefined && rightRank !== undefined) return leftRank - rightRank;
    if (leftRank !== undefined) return -1;
    if (rightRank !== undefined) return 1;
    return left.localeCompare(right);
  }

  private portableModuleName(label: string): string {
    return label.replace(/^Portable module: /, '').replace(/\.zsh$/, '');
  }

  private async discoverLoaders(): Promise<ZshFile[]> {
    const files: ZshFile[] = [];
    for (const name of loaderNames) {
      const candidate = join(this.homeDirectory, name);
      if (!(await this.isRegularFile(candidate))) continue;
      if (await this.isManagedLoader(candidate)) {
        files.push(this.file('managed-loader', `Managed loader: ${name}`, candidate, name));
      }
    }
    return files;
  }

  private async discoverPrivateBoundary(managedRoot: string): Promise<ZshFile[]> {
    const candidate = join(managedRoot, 'private.zsh');
    return (await this.isRegularFile(candidate))
      ? [this.file('private', 'Private boundary: private.zsh', candidate, 'private.zsh')]
      : [];
  }

  private async discoverPortableModules(managedRoot: string): Promise<ZshFile[]> {
    const modulesRoot = join(managedRoot, 'current', 'modules');
    let names: string[];
    try {
      names = await fs.readdir(modulesRoot);
    } catch {
      return [];
    }

    const files: ZshFile[] = [];
    for (const name of names.sort((left, right) => left.localeCompare(right))) {
      if (name === 'private.zsh' || !name.endsWith('.zsh')) continue;
      const candidate = join(modulesRoot, name);
      if (await this.isRegularFile(candidate)) {
        files.push(this.file('managed-module', `Portable module: ${name}`, candidate, name));
      }
    }
    return files;
  }

  private async discoverLegacyContext(): Promise<ZshFile[]> {
    const files: ZshFile[] = [];
    for (const name of loaderNames) {
      const candidate = join(this.homeDirectory, name);
      if ((await this.isRegularFile(candidate)) && !(await this.isManagedLoader(candidate))) {
        files.push(this.file('legacy', `Legacy migration context: ${name}`, candidate, name));
      }
    }

    const legacyRoot = join(this.configDirectory, 'zsh');
    let names: string[];
    try {
      names = await fs.readdir(legacyRoot);
    } catch {
      return files;
    }
    for (const name of names.sort((left, right) => left.localeCompare(right))) {
      const candidate = join(legacyRoot, name);
      if (await this.isRegularFile(candidate)) {
        files.push(this.file('legacy', `Legacy migration context: ${name}`, candidate, name));
      }
    }
    return files;
  }

  private file(kind: ZshConfigKind, name: string, path: string, basename: string): ZshFile {
    return { kind, name, path, isZshrc: basename === '.zshrc' };
  }

  private async isRegularFile(path: string): Promise<boolean> {
    try {
      const metadata = await fs.lstat(path);
      return metadata.isFile() && !metadata.isSymbolicLink();
    } catch {
      return false;
    }
  }

  private async isManagedLoader(path: string): Promise<boolean> {
    try {
      return (await fs.readFile(path, 'utf8')).startsWith('# mzsh-managed-loader\n');
    } catch {
      return false;
    }
  }
}
