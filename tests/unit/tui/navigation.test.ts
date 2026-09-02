import { describe, expect, test } from 'bun:test';
import {
  createDefaultBreadcrumbs,
  createNavigationItems,
  getNextEnvMode,
  getNextScreen,
  getPreviousScreen,
  TUI_ENV_MODES,
  TUI_SCREENS,
  type TuiScreen,
  type TuiState,
} from '../../../src/tui/types';

describe('TUI navigation utilities', () => {
  test('cycles screens forward in strict order', () => {
    expect(getNextScreen('dashboard')).toBe('plan-review');
    expect(getNextScreen('plan-review')).toBe('history');
    expect(getNextScreen('history')).toBe('dag');
    expect(getNextScreen('dag')).toBe('config');
    expect(getNextScreen('config')).toBe('inventory');
    expect(getNextScreen('inventory')).toBe('plan-builder');
    expect(getNextScreen('plan-builder')).toBe('dashboard');
  });

  test('cycles screens backward in strict order', () => {
    expect(getPreviousScreen('dashboard')).toBe('plan-builder');
    expect(getPreviousScreen('plan-builder')).toBe('inventory');
    expect(getPreviousScreen('inventory')).toBe('config');
    expect(getPreviousScreen('config')).toBe('dag');
    expect(getPreviousScreen('dag')).toBe('history');
    expect(getPreviousScreen('history')).toBe('plan-review');
    expect(getPreviousScreen('plan-review')).toBe('dashboard');
  });

  test('cycles environment modes forward', () => {
    expect(getNextEnvMode('development')).toBe('production');
    expect(getNextEnvMode('production')).toBe('custom');
    expect(getNextEnvMode('custom')).toBe('development');
  });

  test('contains all expected screens and env modes', () => {
    expect(TUI_SCREENS).toEqual([
      'dashboard',
      'plan-review',
      'history',
      'dag',
      'config',
      'inventory',
      'plan-builder',
    ]);
    expect(TUI_ENV_MODES).toEqual(['development', 'production', 'custom']);
  });

  test('generates default breadcrumbs for dashboard screen', () => {
    const state: TuiState = {
      screen: 'dashboard',
      inventory: { healthy: 5, attention: 0 },
      history: [],
    };
    expect(createDefaultBreadcrumbs(state)).toEqual(['◆ MZSH', 'Dashboard', '[Active]']);
  });

  test('generates default breadcrumbs for dag screen', () => {
    const state: TuiState = {
      screen: 'dag',
      inventory: { healthy: 5, attention: 0 },
      history: [],
    };
    expect(createDefaultBreadcrumbs(state)).toEqual(['◆ MZSH', 'DAG Workflow', '[Workflow]']);
  });

  test('generates default breadcrumbs for plan-review with and without plan', () => {
    const withoutPlan: TuiState = {
      screen: 'plan-review',
      inventory: { healthy: 5, attention: 0 },
      history: [],
    };
    expect(createDefaultBreadcrumbs(withoutPlan)).toEqual(['◆ MZSH', 'Plan Review', '[Idle]']);

    const withPlan: TuiState = {
      screen: 'plan-review',
      inventory: { healthy: 5, attention: 0 },
      history: [],
      plan: {
        action: 'bootstrap',
        reviewedPlanId: 'plan-123',
        confirmation: 'APPLY',
      },
    };
    expect(createDefaultBreadcrumbs(withPlan)).toEqual(['◆ MZSH', 'Plan Review', '[BOOTSTRAP]']);
  });

  test('generates default breadcrumbs for history screen with events count', () => {
    const emptyHistory: TuiState = {
      screen: 'history',
      inventory: { healthy: 5, attention: 0 },
      history: [],
    };
    expect(createDefaultBreadcrumbs(emptyHistory)).toEqual(['◆ MZSH', 'History', '[0 Events]']);

    const populatedHistory: TuiState = {
      screen: 'history',
      inventory: { healthy: 5, attention: 0 },
      history: [
        { action: 'audit', result: 'applied', occurredAt: '2026-09-01T00:00:00Z' },
        { action: 'update', result: 'applied', occurredAt: '2026-09-01T01:00:00Z' },
      ],
    };
    expect(createDefaultBreadcrumbs(populatedHistory)).toEqual(['◆ MZSH', 'History', '[2 Events]']);
  });

  test('creates navigation items with correct active flags', () => {
    const screens: readonly TuiScreen[] = ['dashboard', 'plan-review', 'history', 'dag'];

    for (const activeScreen of screens) {
      const items = createNavigationItems(activeScreen);
      expect(items).toHaveLength(4);

      const activeItem = items.find((item) => item.screen === activeScreen);
      expect(activeItem?.active).toBe(true);

      const inactiveItems = items.filter((item) => item.screen !== activeScreen);
      expect(inactiveItems.every((item) => !item.active)).toBe(true);
    }
  });
});
