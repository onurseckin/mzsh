import { createCliRenderer } from '@opentui/core';
import { registerDefaultKeys, registerLeader } from '@opentui/keymap/addons';
import { createOpenTuiKeymap } from '@opentui/keymap/opentui';
import { KeymapProvider } from '@opentui/keymap/react';
import { createRoot } from '@opentui/react';
import { catalog as defaultCatalog } from '../catalog/command-catalog';
import type { CommandCatalog } from '../catalog/types';
import { TuiApp } from './app';
import type { TuiState } from './types';

export interface RunTuiDependencies {
  readonly catalog?: CommandCatalog;
  readonly state: () => TuiState;
}

export interface TuiLauncher {
  launch(): void;
}

export function createTuiLauncher(dependencies: RunTuiDependencies): TuiLauncher {
  return { launch: () => void runTui(dependencies) };
}

export async function runTui(dependencies: RunTuiDependencies): Promise<void> {
  const renderer = await createCliRenderer({ screenMode: 'alternate-screen' });
  const keymap = createOpenTuiKeymap(renderer);
  registerDefaultKeys(keymap);
  registerLeader(keymap, { trigger: 'space', name: 'leader' });
  createRoot(renderer).render(
    <KeymapProvider keymap={keymap}>
      <TuiApp
        catalog={dependencies.catalog !== undefined ? dependencies.catalog : defaultCatalog}
        state={dependencies.state()}
      />
    </KeymapProvider>
  );
}
