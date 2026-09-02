import { describe, expect, test } from 'bun:test';
import { catalog } from '../../../src/catalog/command-catalog';
import { ActionStrip } from '../../../src/tui/components/actions';
import { Header } from '../../../src/tui/components/header';
import { HelpOverlay } from '../../../src/tui/components/help-overlay';
import { Status } from '../../../src/tui/components/status';
import { DagScreen } from '../../../src/tui/screens/dag-screen';
import { Dashboard } from '../../../src/tui/screens/dashboard';
import { History } from '../../../src/tui/screens/history';
import { PlanReview } from '../../../src/tui/screens/plan-review';
import { createTuiViewModel, type TuiState } from '../../../src/tui/types';

describe('TUI components and screen views', () => {
  const baseState: TuiState = {
    screen: 'dashboard',
    inventory: { healthy: 3, attention: 2 },
    history: [{ action: 'audit', result: 'applied', occurredAt: '2026-09-01T12:00:00.000Z' }],
    envMode: 'development',
    shell: 'zsh',
    os: 'darwin',
  };

  test('creates view models for all 4 supported screens', () => {
    const dashboardVM = createTuiViewModel(catalog, { ...baseState, screen: 'dashboard' });
    expect(dashboardVM.screen).toBe('dashboard');
    expect(dashboardVM.breadcrumbs).toEqual(['◆ MZSH', 'Dashboard', '[Active]']);

    const planVM = createTuiViewModel(catalog, {
      ...baseState,
      screen: 'plan-review',
      plan: {
        action: 'setup',
        reviewedPlanId: 'plan-setup-1',
        confirmation: 'APPLY',
      },
    });
    expect(planVM.screen).toBe('plan-review');
    expect(planVM.plan?.action).toBe('setup');
    expect(planVM.breadcrumbs).toEqual(['◆ MZSH', 'Plan Review', '[SETUP]']);

    const historyVM = createTuiViewModel(catalog, { ...baseState, screen: 'history' });
    expect(historyVM.screen).toBe('history');
    expect(historyVM.breadcrumbs).toEqual(['◆ MZSH', 'History', '[1 Events]']);

    const dagVM = createTuiViewModel(catalog, { ...baseState, screen: 'dag' });
    expect(dagVM.screen).toBe('dag');
    expect(dagVM.breadcrumbs).toEqual(['◆ MZSH', 'DAG Workflow', '[Workflow]']);
  });

  test('renders Header and HelpOverlay component tree structures without error', () => {
    const viewModel = createTuiViewModel(catalog, {
      ...baseState,
      showHelp: true,
    });

    const headerNode = Header({ viewModel });
    expect(headerNode).toBeDefined();

    const helpNode = HelpOverlay({ viewModel });
    expect(helpNode).toBeDefined();

    const actionStripNode = ActionStrip({ actions: viewModel.actions });
    expect(actionStripNode).toBeDefined();

    const statusNode = Status({ inventory: viewModel.inventory });
    expect(statusNode).toBeDefined();

    const dashboardNode = Dashboard({ viewModel });
    expect(dashboardNode).toBeDefined();

    const historyNode = History({ viewModel });
    expect(historyNode).toBeDefined();

    const planReviewNode = PlanReview({ viewModel });
    expect(planReviewNode).toBeDefined();

    const dagNode = DagScreen({ viewModel });
    expect(dagNode).toBeDefined();
  });

  test('correctly categorizes shortcuts in HelpOverlay view model', () => {
    const viewModel = createTuiViewModel(catalog, baseState);
    const navShortcuts = viewModel.shortcuts.filter((s) => s.category === 'Navigation');
    const actionShortcuts = viewModel.shortcuts.filter((s) => s.category === 'Actions');
    const globalShortcuts = viewModel.shortcuts.filter((s) => s.category === 'Global');

    expect(navShortcuts.length).toBeGreaterThanOrEqual(5);
    expect(actionShortcuts.length).toBeGreaterThanOrEqual(6);
    expect(globalShortcuts.length).toBeGreaterThanOrEqual(2);

    expect(navShortcuts.some((s) => s.key.includes('Tab'))).toBe(true);
    expect(actionShortcuts.some((s) => s.key.includes('<leader>e'))).toBe(true);
    expect(globalShortcuts.some((s) => s.key === '?')).toBe(true);
  });
});
