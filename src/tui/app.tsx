import { useState } from 'react';
import { useBindings } from '@opentui/keymap/react';
import { ActionStrip } from './components/actions';
import { Header } from './components/header';
import { HelpOverlay } from './components/help-overlay';
import { DagScreen } from './screens/dag-screen';
import { Dashboard } from './screens/dashboard';
import { History } from './screens/history';
import { PlanReview } from './screens/plan-review';
import {
  createTuiViewModel,
  getNextEnvMode,
  getNextScreen,
  getPreviousScreen,
  type TuiEnvMode,
  type TuiScreen,
  type TuiState,
} from './types';
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
  const [showHelp, setShowHelp] = useState<boolean>(state.showHelp ?? false);
  const [envMode, setEnvMode] = useState<TuiEnvMode>(
    state.envMode ?? state.envContext?.envMode ?? 'development'
  );

  const viewModel = createTuiViewModel(catalog, {
    ...state,
    screen,
    showHelp,
    envMode,
  });

  useBindings(
    () => ({
      commands: [
        {
          name: 'nav.next',
          run: () => setScreen((current) => getNextScreen(current)),
        },
        {
          name: 'nav.prev',
          run: () => setScreen((current) => getPreviousScreen(current)),
        },
        {
          name: 'nav.dashboard',
          run: () => setScreen('dashboard'),
        },
        {
          name: 'nav.plan-review',
          run: () => setScreen('plan-review'),
        },
        {
          name: 'nav.history',
          run: () => setScreen('history'),
        },
        {
          name: 'nav.dag',
          run: () => setScreen('dag'),
        },
        {
          name: 'env.toggle',
          run: () => setEnvMode((current) => getNextEnvMode(current)),
        },
        {
          name: 'help.toggle',
          run: () => setShowHelp((prev) => !prev),
        },
        {
          name: 'help.close',
          run: () => setShowHelp(false),
        },
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
        { key: 'tab', cmd: 'nav.next' },
        { key: '<shift+tab>', cmd: 'nav.prev' },
        { key: 'shift+tab', cmd: 'nav.prev' },
        { key: 's-tab', cmd: 'nav.prev' },
        { key: 'right', cmd: 'nav.next' },
        { key: 'l', cmd: 'nav.next' },
        { key: 'left', cmd: 'nav.prev' },
        { key: 'h', cmd: 'nav.prev' },
        { key: '1', cmd: 'nav.dashboard' },
        { key: '2', cmd: 'nav.plan-review' },
        { key: '3', cmd: 'nav.history' },
        { key: '4', cmd: 'nav.dag' },
        { key: '<leader>d', cmd: 'nav.dashboard' },
        { key: '<leader>p', cmd: 'nav.plan-review' },
        { key: '<leader>h', cmd: 'nav.history' },
        { key: '<leader>g', cmd: 'nav.dag' },
        { key: 'g g', cmd: 'nav.dag' },
        { key: '<leader>e', cmd: 'env.toggle' },
        { key: '?', cmd: 'help.toggle' },
        { key: '<leader>?', cmd: 'help.toggle' },
        { key: 'escape', cmd: 'help.close' },
        { key: 'q', cmd: 'help.close' },
        { key: 'enter', cmd: 'help.close' },
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
    <box
      style={{
        flexDirection: 'column',
        height: '100%',
        padding: 1,
        gap: 1,
      }}
    >
      <Header viewModel={viewModel} />

      <box
        style={{
          flexGrow: 1,
          flexDirection: 'column',
          padding: 1,
        }}
      >
        {viewModel.showHelp ? (
          <HelpOverlay viewModel={viewModel} />
        ) : (
          <>
            {viewModel.screen === 'dashboard' ? <Dashboard viewModel={viewModel} /> : null}
            {viewModel.screen === 'plan-review' ? <PlanReview viewModel={viewModel} /> : null}
            {viewModel.screen === 'history' ? <History viewModel={viewModel} /> : null}
            {viewModel.screen === 'dag' ? <DagScreen viewModel={viewModel} /> : null}
          </>
        )}
      </box>

      <box style={{ marginTop: 'auto', flexDirection: 'column', gap: 1 }}>
        <box
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <text fg="#81a1c1">{`leader: ${viewModel.leader}  •  [?] help cheat sheet  •  [<leader>e] cycle env`}</text>
          <text fg="#616e88">Tab/Shift+Tab cycle • 1-4 jump • q close</text>
        </box>
        <ActionStrip actions={viewModel.actions} />
      </box>
    </box>
  );
}
