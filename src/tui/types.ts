import type { CommandCatalog, CommandRisk } from '../catalog/types';

export type TuiScreen = 'dashboard' | 'plan-review' | 'history' | 'dag';

export type TuiEnvMode = 'production' | 'development' | 'custom';

export interface TuiEnvContext {
  readonly envMode: TuiEnvMode;
  readonly shell: string;
  readonly os: string;
  readonly arch?: string;
}

export interface TuiInventorySummary {
  readonly healthy: number;
  readonly attention: number;
  readonly total?: number;
  readonly details?: readonly string[];
}

export type TuiHistoryResult = 'applied' | 'failed' | 'rolled_back';

export interface TuiHistoryEntry {
  readonly action: string;
  readonly result: TuiHistoryResult;
  readonly occurredAt: string;
  readonly planId?: string;
  readonly targets?: readonly string[];
  readonly details?: string;
  readonly durationMs?: number;
}

export interface TuiPlanOperation {
  readonly type: 'symlink' | 'migration' | 'receipt' | 'backup' | 'config' | 'verify';
  readonly description: string;
  readonly target?: string;
}

export interface TuiPlanState {
  readonly action: string;
  readonly reviewedPlanId: string;
  readonly confirmation: 'APPLY';
  readonly risk?: CommandRisk;
  readonly operations?: readonly (string | TuiPlanOperation)[];
  readonly preflightChecksPassed?: boolean;
  readonly rollbackSnapshotVerified?: boolean;
  readonly affectedTargets?: readonly string[];
  readonly summary?: string;
}

export interface TuiAuditStatus {
  readonly clean: boolean;
  readonly passedChecks: number;
  readonly totalChecks: number;
  readonly findingsCount: number;
  readonly message?: string;
}

export interface TuiState {
  readonly screen: TuiScreen;
  readonly inventory: TuiInventorySummary;
  readonly history: readonly TuiHistoryEntry[];
  readonly plan?: TuiPlanState;
  readonly envMode?: TuiEnvMode;
  readonly shell?: string;
  readonly os?: string;
  readonly arch?: string;
  readonly envContext?: TuiEnvContext;
  readonly showHelp?: boolean;
  readonly breadcrumbs?: readonly string[];
  readonly auditStatus?: TuiAuditStatus;
  readonly viewport?: Partial<TuiViewportDimensions> | TuiViewportProfileName;
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

export interface TuiNavigationItem {
  readonly screen: TuiScreen;
  readonly label: string;
  readonly shortcut: string;
  readonly active: boolean;
}

export {
  type TuiViewportProfileName,
  type TuiViewportDimensions,
  type TuiViewportProfile,
  TUI_VIEWPORT_PROFILES,
  resolveViewportProfile,
} from './viewport';
import {
  resolveViewportProfile,
  type TuiViewportDimensions,
  type TuiViewportProfile,
  type TuiViewportProfileName,
} from './viewport';

export interface TuiShortcutHelp {
  readonly key: string;
  readonly description: string;
  readonly category: 'Navigation' | 'Actions' | 'Global';
}

export interface TuiPlanView {
  readonly action: string;
  readonly reviewedPlanId: string;
  readonly confirmation: 'APPLY';
  readonly requiresConfirmation: true;
  readonly risk?: CommandRisk;
  readonly operations?: readonly (string | TuiPlanOperation)[];
  readonly preflightChecksPassed?: boolean;
  readonly rollbackSnapshotVerified?: boolean;
  readonly affectedTargets?: readonly string[];
  readonly summary?: string;
}

export interface TuiViewModel {
  readonly leader: 'space';
  readonly screen: TuiScreen;
  readonly inventory: TuiInventorySummary;
  readonly history: readonly TuiHistoryEntry[];
  readonly plan?: TuiPlanView;
  readonly navigation: readonly TuiNavigation[];
  readonly navigationItems: readonly TuiNavigationItem[];
  readonly actions: readonly TuiAction[];
  readonly envContext: TuiEnvContext;
  readonly showHelp: boolean;
  readonly breadcrumbs: readonly string[];
  readonly shortcuts: readonly TuiShortcutHelp[];
  readonly auditStatus?: TuiAuditStatus;
  readonly viewport: TuiViewportProfile;
}

export const TUI_SCREENS: readonly TuiScreen[] = ['dashboard', 'plan-review', 'history', 'dag'];
export const TUI_ENV_MODES: readonly TuiEnvMode[] = ['development', 'production', 'custom'];

export function getNextScreen(current: TuiScreen): TuiScreen {
  const currentIndex = TUI_SCREENS.indexOf(current);
  const nextIndex = (currentIndex + 1) % TUI_SCREENS.length;
  return TUI_SCREENS[nextIndex] ?? 'dashboard';
}

export function getPreviousScreen(current: TuiScreen): TuiScreen {
  const currentIndex = TUI_SCREENS.indexOf(current);
  const prevIndex = (currentIndex - 1 + TUI_SCREENS.length) % TUI_SCREENS.length;
  return TUI_SCREENS[prevIndex] ?? 'dashboard';
}

export function getNextEnvMode(current: TuiEnvMode): TuiEnvMode {
  const currentIndex = TUI_ENV_MODES.indexOf(current);
  const nextIndex = (currentIndex + 1) % TUI_ENV_MODES.length;
  return TUI_ENV_MODES[nextIndex] ?? 'development';
}

export function createDefaultBreadcrumbs(state: {
  readonly screen: TuiScreen;
  readonly plan?: TuiPlanState | TuiPlanView;
  readonly history: readonly TuiHistoryEntry[];
  readonly envContext?: TuiEnvContext;
  readonly envMode?: TuiEnvMode;
  readonly breadcrumbs?: readonly string[];
}): readonly string[] {
  const screenTitle =
    state.screen === 'dashboard'
      ? 'Dashboard'
      : state.screen === 'plan-review'
        ? 'Plan Review'
        : state.screen === 'history'
          ? 'History'
          : 'DAG Workflow';

  let statusTag = '[Active]';
  if (state.screen === 'plan-review') {
    statusTag = state.plan !== undefined ? `[${state.plan.action.toUpperCase()}]` : '[Idle]';
  } else if (state.screen === 'history') {
    statusTag = `[${state.history.length} Events]`;
  } else if (state.screen === 'dag') {
    statusTag = '[Workflow]';
  }

  return ['◆ MZSH', screenTitle, statusTag];
}

export const DEFAULT_TUI_SHORTCUTS: readonly TuiShortcutHelp[] = [
  {
    key: 'Tab / Shift+Tab',
    description: 'Cycle screens forward / backward',
    category: 'Navigation',
  },
  { key: '← / → or h / l', description: 'Switch active screen', category: 'Navigation' },
  { key: '1 / 2 / 3 / 4', description: 'Jump directly to screen', category: 'Navigation' },
  { key: '<leader>d / g d', description: 'Navigate to Dashboard', category: 'Navigation' },
  { key: '<leader>p / g p', description: 'Navigate to Plan Review', category: 'Navigation' },
  { key: '<leader>h / g h', description: 'Navigate to History', category: 'Navigation' },
  { key: '<leader>g / g g', description: 'Navigate to DAG Workflow', category: 'Navigation' },
  {
    key: '<leader>e',
    description: 'Toggle Environment mode (dev/prod/custom)',
    category: 'Actions',
  },
  { key: '<leader>i', description: 'Inspect Inventory', category: 'Actions' },
  { key: '<leader>a', description: 'Audit local shell environment', category: 'Actions' },
  { key: '<leader>b', description: 'Plan / apply adoption bootstrap', category: 'Actions' },
  { key: '<leader>u', description: 'Plan / apply managed update', category: 'Actions' },
  { key: '<leader>r', description: 'Restore recorded adoption rollback', category: 'Actions' },
  { key: '<leader>s', description: 'Set up managed lifecycle', category: 'Actions' },
  { key: 'w', description: 'Cycle active DAG workflow', category: 'Actions' },
  { key: 'c', description: 'Toggle DAG critical path highlight', category: 'Actions' },
  { key: 'f / s', description: 'Cycle DAG task status filter', category: 'Actions' },
  { key: 'r / space', description: 'Step DAG simulation forward', category: 'Actions' },
  { key: '?', description: 'Toggle Help & shortcut cheat sheet', category: 'Global' },
  { key: 'Esc / q / Enter', description: 'Close modal / dismiss overlay', category: 'Global' },
];

export function createNavigationItems(activeScreen: TuiScreen): readonly TuiNavigationItem[] {
  return [
    {
      screen: 'dashboard',
      label: 'Dashboard',
      shortcut: '<leader>d',
      active: activeScreen === 'dashboard',
    },
    {
      screen: 'plan-review',
      label: 'Plan Review',
      shortcut: '<leader>p',
      active: activeScreen === 'plan-review',
    },
    {
      screen: 'history',
      label: 'History',
      shortcut: '<leader>h',
      active: activeScreen === 'history',
    },
    {
      screen: 'dag',
      label: 'DAG Workflow',
      shortcut: '<leader>g',
      active: activeScreen === 'dag',
    },
  ];
}

function actionScreen(name: string, risk: CommandRisk): TuiScreen {
  if (risk === 'destructive') return 'plan-review';
  if (name === 'dag') return 'dag';
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
  const envMode: TuiEnvMode = state.envMode ?? state.envContext?.envMode ?? 'development';
  const shell =
    state.shell ??
    state.envContext?.shell ??
    (typeof process !== 'undefined' && process.env.SHELL ? process.env.SHELL : 'zsh');
  const os =
    state.os ??
    state.envContext?.os ??
    (typeof process !== 'undefined' && process.platform ? process.platform : 'darwin');
  const arch = state.arch ?? state.envContext?.arch;
  const envContext: TuiEnvContext = {
    envMode,
    shell,
    os,
    ...(arch !== undefined ? { arch } : {}),
  };
  const viewport = resolveViewportProfile(state.viewport);

  const auditStatus: TuiAuditStatus = state.auditStatus ?? {
    clean: state.inventory.attention === 0,
    passedChecks: state.inventory.healthy > 0 ? state.inventory.healthy * 2 : 6,
    totalChecks: (state.inventory.healthy + state.inventory.attention) * 2 || 6,
    findingsCount: state.inventory.attention,
    message:
      state.inventory.attention === 0
        ? 'All checks passed • Shell configuration & symlinks validated'
        : `${state.inventory.attention} finding(s) require attention • Run audit for remediation`,
  };

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
    navigationItems: createNavigationItems(state.screen),
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
    envContext,
    showHelp: state.showHelp ?? false,
    breadcrumbs: state.breadcrumbs ?? createDefaultBreadcrumbs({ ...state, envContext }),
    shortcuts: DEFAULT_TUI_SHORTCUTS,
    auditStatus,
    viewport,
  };
}
