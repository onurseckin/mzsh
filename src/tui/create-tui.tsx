import { createCliRenderer } from '@opentui/core';
import {
  registerDefaultKeys,
  registerEscapeClearsPendingSequence,
  registerLeader,
} from '@opentui/keymap/addons';
import { createOpenTuiKeymap } from '@opentui/keymap/opentui';
import { KeymapProvider } from '@opentui/keymap/react';
import { createRoot } from '@opentui/react';
import process from 'node:process';
import { catalog as defaultCatalog } from '../catalog/command-catalog';
import type { CommandCatalog } from '../catalog/types';
import {
  isPipedOrBackground,
  registerTerminalSignalTraps,
  restoreTerminalState,
} from '../infrastructure/terminal-cleanup';
import { TuiApp } from './app';
import type { TuiState } from './types';

export interface RunTuiDependencies {
  readonly catalog?: CommandCatalog;
  readonly state: () => TuiState;
  readonly isTTY?: boolean;
}

export interface TuiLauncher {
  launch(overrideState?: Partial<TuiState>): void;
}

export function createTuiLauncher(dependencies: RunTuiDependencies): TuiLauncher {
  return {
    launch: (overrideState?: Partial<TuiState>) =>
      void runTui({
        ...dependencies,
        state: () => ({ ...dependencies.state(), ...overrideState }),
      }),
  };
}

export async function runTui(dependencies: RunTuiDependencies): Promise<void> {
  if (dependencies.isTTY === false || isPipedOrBackground()) {
    process.stderr.write('MZSH TUI requires an interactive TTY terminal.\n');
    return;
  }

  let unregisterTraps: (() => void) | null = null;

  try {
    const renderer = await createCliRenderer({ screenMode: 'alternate-screen' });

    const cleanup = () => {
      if (unregisterTraps) {
        unregisterTraps();
        unregisterTraps = null;
      }
      try {
        renderer.destroy?.();
      } catch {
        // Ignored
      }
      restoreTerminalState({ clearAlternateScreen: true });
    };

    unregisterTraps = registerTerminalSignalTraps({
      onSignal: () => {
        cleanup();
        process.exit(0);
      },
      onCrash: () => {
        cleanup();
      },
      cleanup,
    });

    const keymap = createOpenTuiKeymap(renderer);
    registerDefaultKeys(keymap);
    registerEscapeClearsPendingSequence(keymap);
    registerLeader(keymap, { trigger: 'space', name: 'leader' });

    createRoot(renderer).render(
      <KeymapProvider keymap={keymap}>
        <TuiApp
          catalog={dependencies.catalog !== undefined ? dependencies.catalog : defaultCatalog}
          state={dependencies.state()}
        />
      </KeymapProvider>
    );
  } catch (error) {
    if (unregisterTraps) {
      unregisterTraps();
      unregisterTraps = null;
    }
    restoreTerminalState({ clearAlternateScreen: true });
    throw error;
  }
}
