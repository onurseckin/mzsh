import { describe, expect, test } from 'bun:test';
import { catalog } from '../../../src/catalog/command-catalog';
import { runMzshCli } from '../../../src/cli/run-cli';
import { createTuiViewModel, type TuiState } from '../../../src/tui/types';

const state: TuiState = {
  screen: 'plan-review',
  inventory: { healthy: 4, attention: 1 },
  history: [{ action: 'rollback', result: 'applied', occurredAt: '2026-08-27T00:00:00.000Z' }],
  plan: {
    action: 'rollback',
    reviewedPlanId: '4b5fd2fd-2f80-4ce9-a8f3-5c12dfacbe49',
    confirmation: 'APPLY',
  },
};

describe('TUI adapter view model', () => {
  test('exposes the destructive plan action with its visible leader binding', () => {
    const action = createTuiViewModel(catalog, state).actions.find(
      ({ id }) => id === 'rollback.apply'
    );

    expect(action).toMatchObject({
      keys: ['space', 'r'],
      risk: 'destructive',
      enabled: false,
      visible: true,
    });
  });

  test('renders a reviewed plan as confirmation state without an executable mutation action', () => {
    const viewModel = createTuiViewModel(catalog, state);

    expect(viewModel.screen).toBe('plan-review');
    expect(viewModel.plan).toEqual({
      action: 'rollback',
      reviewedPlanId: '4b5fd2fd-2f80-4ce9-a8f3-5c12dfacbe49',
      confirmation: 'APPLY',
      requiresConfirmation: true,
    });
    expect(viewModel.actions.every((action) => 'execute' in action)).toBe(false);
  });

  test('reaches the TUI only through its typed launcher dependency', () => {
    let launches = 0;

    expect(
      runMzshCli(['tui'], {
        home: '/home',
        xdgConfig: '/home/.config',
        xdgCache: '/home/.cache',
        repositoryRoot: '/checkout',
        write: () => undefined,
        tui: { launch: () => (launches += 1) },
      })
    ).toBe(0);
    expect(launches).toBe(1);
  });
});
