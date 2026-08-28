import { describe, expect, test } from 'bun:test';
import { catalog } from '../../../src/catalog/command-catalog';
import { createTuiViewModel, type TuiState } from '../../../src/tui/types';

const state: TuiState = {
  screen: 'dashboard',
  inventory: { healthy: 0, attention: 0 },
  history: [],
};

describe('TUI action bindings', () => {
  test('derives Space-leader and Neovim navigation bindings from the catalog', () => {
    const viewModel = createTuiViewModel(catalog, state);

    expect(viewModel.leader).toBe('space');
    expect(viewModel.navigation).toEqual([
      { screen: 'dashboard', keys: ['g', 'd'] },
      { screen: 'plan-review', keys: ['g', 'p'] },
      { screen: 'history', keys: ['g', 'h'] },
    ]);
    expect(viewModel.actions.find(({ id }) => id === 'inventory.open')).toMatchObject({
      keys: ['space', 'i'],
      enabled: true,
    });
  });
});
