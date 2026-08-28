import { useState } from 'react';
import { useBindings } from '@opentui/keymap/react';
import { ActionStrip } from './components/actions';
import { Dashboard } from './screens/dashboard';
import { History } from './screens/history';
import { PlanReview } from './screens/plan-review';
import { createTuiViewModel, type TuiScreen, type TuiState } from './types';
import type { CommandCatalog } from '../catalog/types';

export interface TuiAppProps {
  readonly catalog: CommandCatalog;
  readonly state: TuiState;
}

function sequence(keys: readonly string[]): string {
  return keys[0] === 'space' ? `<leader>${keys[1]}` : keys.join(' ');
}

export function TuiApp({ catalog, state }: TuiAppProps): React.ReactNode {
  const [screen, setScreen] = useState<TuiScreen>(state.screen);
  const viewModel = createTuiViewModel(catalog, { ...state, screen });
  useBindings(
    () => ({
      commands: [
        ...viewModel.navigation.map((navigation) => ({
          name: `screen.${navigation.screen}`,
          run: () => setScreen(navigation.screen),
        })),
        ...viewModel.actions.map((action) => ({
          name: `action.${action.id}`,
          run: () => setScreen(action.screen),
        })),
      ],
      bindings: [
        ...viewModel.navigation.map((navigation) => ({
          key: sequence(navigation.keys),
          cmd: `screen.${navigation.screen}`,
        })),
        ...viewModel.actions.map((action) => ({
          key: sequence(action.keys),
          cmd: `action.${action.id}`,
        })),
      ],
    }),
    [viewModel]
  );
  return (
    <box style={{ flexDirection: 'column', height: '100%', padding: 1, gap: 1 }}>
      {viewModel.screen === 'dashboard' ? <Dashboard viewModel={viewModel} /> : null}
      {viewModel.screen === 'plan-review' ? <PlanReview viewModel={viewModel} /> : null}
      {viewModel.screen === 'history' ? <History viewModel={viewModel} /> : null}
      <box style={{ marginTop: 'auto', flexDirection: 'column', gap: 1 }}>
        <text fg="#81a1c1">{`leader: ${viewModel.leader}`}</text>
        <ActionStrip actions={viewModel.actions} />
      </box>
    </box>
  );
}
