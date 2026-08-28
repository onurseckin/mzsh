import type { CommandCatalog, CommandRisk } from '../catalog/types';

export type TuiScreen = 'dashboard' | 'plan-review' | 'history';

export interface TuiInventorySummary {
  readonly healthy: number;
  readonly attention: number;
}

export interface TuiHistoryEntry {
  readonly action: string;
  readonly result: 'applied' | 'failed';
  readonly occurredAt: string;
}

export interface TuiPlanState {
  readonly action: string;
  readonly reviewedPlanId: string;
  readonly confirmation: 'APPLY';
}

export interface TuiState {
  readonly screen: TuiScreen;
  readonly inventory: TuiInventorySummary;
  readonly history: readonly TuiHistoryEntry[];
  readonly plan?: TuiPlanState;
}

export interface TuiAction {
  readonly id: string;
  readonly label: string;
  readonly keys: readonly string[];
  readonly risk: CommandRisk;
  readonly enabled: boolean;
  readonly visible: true;
  readonly screen: TuiScreen;
}

export interface TuiNavigation {
  readonly screen: TuiScreen;
  readonly keys: readonly string[];
}

export interface TuiPlanView {
  readonly action: string;
  readonly reviewedPlanId: string;
  readonly confirmation: 'APPLY';
  readonly requiresConfirmation: true;
}

export interface TuiViewModel {
  readonly leader: 'space';
  readonly screen: TuiScreen;
  readonly inventory: TuiInventorySummary;
  readonly history: readonly TuiHistoryEntry[];
  readonly plan?: TuiPlanView;
  readonly navigation: readonly TuiNavigation[];
  readonly actions: readonly TuiAction[];
}

function actionScreen(name: string, risk: CommandRisk): TuiScreen {
  if (risk === 'destructive') return 'plan-review';
  return name === 'history' ? 'history' : 'dashboard';
}

function actionId(name: string, risk: CommandRisk): string {
  return `${name}.${risk === 'destructive' ? 'apply' : 'open'}`;
}

function label(name: string): string {
  return name.slice(0, 1).toUpperCase() + name.slice(1);
}

export function createTuiViewModel(catalog: CommandCatalog, state: TuiState): TuiViewModel {
  const tui = catalog.require('tui');
  return {
    leader: tui.tui.leader,
    screen: state.screen,
    inventory: state.inventory,
    history: state.history,
    ...(state.plan === undefined
      ? {}
      : {
          plan: {
            ...state.plan,
            requiresConfirmation: true as const,
          },
        }),
    navigation: tui.tui.navigation,
    actions: catalog.commands
      .filter((command) => command.name !== 'tui')
      .map((command) => ({
        id: actionId(command.name, command.risk),
        label: label(command.name),
        keys: command.tui.keys,
        risk: command.risk,
        enabled: command.available && command.risk !== 'destructive',
        visible: true as const,
        screen: actionScreen(command.name, command.risk),
      })),
  };
}
