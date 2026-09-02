import { describe, expect, test } from 'bun:test';
import { catalog } from '../../../src/catalog/command-catalog';
import { ActionStrip } from '../../../src/tui/components/actions';
import { Status } from '../../../src/tui/components/status';
import { Dashboard } from '../../../src/tui/screens/dashboard';
import { History } from '../../../src/tui/screens/history';
import { PlanReview } from '../../../src/tui/screens/plan-review';
import { createTuiViewModel, type TuiState, type TuiViewModel } from '../../../src/tui/types';

interface GenericReactElement {
  readonly type: unknown;
  readonly props: {
    readonly children?: unknown;
    readonly title?: string;
    readonly titleColor?: string;
    readonly borderColor?: string;
    readonly borderStyle?: string;
    readonly fg?: string;
    readonly [key: string]: unknown;
  };
}

function isReactElement(value: unknown): value is GenericReactElement {
  return typeof value === 'object' && value !== null && 'props' in value;
}

function collectText(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return [];
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return [String(node)];
  }
  if (Array.isArray(node)) {
    return node.flatMap(collectText);
  }
  if (isReactElement(node)) {
    const titleText = node.props.title !== undefined ? [node.props.title] : [];
    const childrenText = collectText(node.props.children);
    return [...titleText, ...childrenText];
  }
  return [];
}

function collectColoredText(node: unknown, targetFg: string): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return [];
  }
  if (Array.isArray(node)) {
    return node.flatMap((child) => collectColoredText(child, targetFg));
  }
  if (isReactElement(node)) {
    const results: string[] = [];
    if (node.props.fg === targetFg) {
      results.push(...collectText(node.props.children));
    }
    results.push(...collectColoredText(node.props.children, targetFg));
    return results;
  }
  return [];
}

describe('OpenTUI Screens and Components Craft', () => {
  const baseState: TuiState = {
    screen: 'dashboard',
    inventory: { healthy: 4, attention: 0 },
    history: [],
    envMode: 'development',
    shell: '/bin/zsh',
    os: 'darwin',
    arch: 'arm64',
  };

  describe('Dashboard screen', () => {
    test('renders System & Environment card with active shell, OS, architecture, and mode', () => {
      const viewModel = createTuiViewModel(catalog, baseState);
      const tree = Dashboard({ viewModel });
      const texts = collectText(tree).join(' ');

      expect(texts).toContain('System & Environment');
      expect(texts).toContain('/bin/zsh');
      expect(texts).toContain('darwin (arm64)');
      expect(texts).toContain('[development]');
      expect(texts).toContain('TUI runtime active & responsive');
    });

    test('renders Health & Inventory card with healthy count, attention count, and glyphs', () => {
      const viewModel = createTuiViewModel(catalog, {
        ...baseState,
        inventory: { healthy: 7, attention: 2 },
      });
      const tree = Dashboard({ viewModel });
      const texts = collectText(tree).join(' ');

      expect(texts).toContain('Health & Inventory');
      expect(texts).toContain('Healthy components: 7');
      expect(texts).toContain('Attention required: 2');
      expect(texts).toContain('Total managed assets: 9');
      expect(texts).toContain('✔');
      expect(texts).toContain('▲');
      expect(texts).toContain('●');
    });

    test('renders Audit & Security card with clean state badge when attention is 0', () => {
      const viewModel = createTuiViewModel(catalog, {
        ...baseState,
        inventory: { healthy: 5, attention: 0 },
      });
      const tree = Dashboard({ viewModel });
      const texts = collectText(tree).join(' ');

      expect(texts).toContain('Audit & Security');
      expect(texts).toContain('✔ All checks passed');
      expect(texts).toContain('Shell configuration & symlinks validated');
      expect(texts).toContain('Rollback readiness & receipt log verified');
      expect(texts).toContain('Dry-run safety invariants enforced');
    });

    test('renders Audit & Security card with warning when attention count > 0', () => {
      const viewModel = createTuiViewModel(catalog, {
        ...baseState,
        inventory: { healthy: 3, attention: 3 },
      });
      const tree = Dashboard({ viewModel });
      const texts = collectText(tree).join(' ');

      expect(texts).toContain('Audit & Security');
      expect(texts).toContain('3 finding(s) require review');
    });

    test('renders Quick Actions suggestions card with clear keyboard hints', () => {
      const viewModel = createTuiViewModel(catalog, baseState);
      const tree = Dashboard({ viewModel });
      const texts = collectText(tree).join(' ');

      expect(texts).toContain('Quick Actions');
      expect(texts).toContain('[<Space> a]');
      expect(texts).toContain('Audit:');
      expect(texts).toContain('[<Space> b]');
      expect(texts).toContain('Bootstrap:');
      expect(texts).toContain('[<Space> u]');
      expect(texts).toContain('Update:');
      expect(texts).toContain('[<Space> i]');
      expect(texts).toContain('Inventory:');
    });

    test('applies distinct APCA colors for different environment modes', () => {
      const devVM = createTuiViewModel(catalog, { ...baseState, envMode: 'development' });
      const prodVM = createTuiViewModel(catalog, { ...baseState, envMode: 'production' });
      const customVM = createTuiViewModel(catalog, { ...baseState, envMode: 'custom' });

      const devTree = Dashboard({ viewModel: devVM });
      const prodTree = Dashboard({ viewModel: prodVM });
      const customTree = Dashboard({ viewModel: customVM });

      const devColored = collectColoredText(devTree, '#ebcb8b');
      expect(devColored.some((t) => t.includes('[development]'))).toBe(true);

      const prodColored = collectColoredText(prodTree, '#a3be8c');
      expect(prodColored.some((t) => t.includes('[production]'))).toBe(true);

      const customColored = collectColoredText(customTree, '#d08770');
      expect(customColored.some((t) => t.includes('[custom]'))).toBe(true);
    });
  });

  describe('PlanReview screen', () => {
    test('renders clean empty state when no plan is selected', () => {
      const viewModel = createTuiViewModel(catalog, { ...baseState, plan: undefined });
      const tree = PlanReview({ viewModel });
      const texts = collectText(tree).join(' ');

      expect(texts).toContain('◇ No pending action plan');
      expect(texts).toContain('No configuration mutations or action plans are currently staged');
      expect(texts).toContain('Available planning actions:');
      expect(texts).toContain('[<Space> b]');
      expect(texts).toContain('[<Space> u]');
      expect(texts).toContain('[<Space> r]');
      expect(texts).toContain('[<Space> s]');
      expect(texts).toContain('mzsh safety invariant');
    });

    test('renders active destructive plan metadata header, operations, safety checklist, and confirmation prompt', () => {
      const viewModel = createTuiViewModel(catalog, {
        ...baseState,
        plan: {
          action: 'bootstrap',
          reviewedPlanId: 'plan-bootstrap-456',
          confirmation: 'APPLY',
        },
      });
      const tree = PlanReview({ viewModel });
      const texts = collectText(tree).join(' ');

      expect(texts).toContain('Plan Metadata & Risk Evaluation');
      expect(texts).toContain('BOOTSTRAP');
      expect(texts).toContain('[DESTRUCTIVE]');
      expect(texts).toContain('plan-bootstrap-456');
      expect(texts).toContain('Change Steps & Operations');
      expect(texts).toContain('Safety & Rollback Checklist');
      expect(texts).toContain('Pre-flight checks passed');
      expect(texts).toContain('Rollback snapshot verified');
      expect(texts).toContain('Confirmation Required');
      expect(texts).toContain(
        'To execute this plan, explicit confirmation token [APPLY] is required.'
      );
      expect(texts).toContain(
        'bun run mzsh -- bootstrap --apply --plan-id plan-bootstrap-456 --confirm APPLY'
      );
    });

    test('renders safe plan risk tag in green for read-only actions', () => {
      const viewModel: TuiViewModel = {
        ...createTuiViewModel(catalog, baseState),
        plan: {
          action: 'audit',
          reviewedPlanId: 'plan-audit-1',
          confirmation: 'APPLY',
          requiresConfirmation: true,
          risk: 'read-only',
        },
      };
      const tree = PlanReview({ viewModel });
      const texts = collectText(tree).join(' ');

      expect(texts).toContain('AUDIT');
      expect(texts).toContain('[SAFE]');
      const safeColored = collectColoredText(tree, '#a3be8c');
      expect(safeColored.some((t) => t.includes('[SAFE]'))).toBe(true);
    });

    test('renders custom change operations and target paths when provided', () => {
      const viewModel: TuiViewModel = {
        ...createTuiViewModel(catalog, baseState),
        plan: {
          action: 'update',
          reviewedPlanId: 'plan-update-999',
          confirmation: 'APPLY',
          requiresConfirmation: true,
          operations: [
            { type: 'symlink', description: 'Create symlink for .zshrc', target: '~/.zshrc' },
            {
              type: 'migration',
              description: 'Migrate legacy functions',
              target: '~/.config/mzsh',
            },
            { type: 'receipt', description: 'Stage rollback receipt' },
          ],
          affectedTargets: ['~/.zshrc', '~/.config/mzsh', '/tmp/mzsh-staging'],
        },
      };
      const tree = PlanReview({ viewModel });
      const texts = collectText(tree).join(' ');

      expect(texts).toContain('Change Steps & Operations (3)');
      expect(texts).toContain('SYMLINK: Create symlink for .zshrc');
      expect(texts).toContain('MIGRATION: Migrate legacy functions');
      expect(texts).toContain('RECEIPT: Stage rollback receipt');
      expect(texts).toContain('/tmp/mzsh-staging');
    });
  });

  describe('History screen', () => {
    test('renders clean empty state when no history exists', () => {
      const viewModel = createTuiViewModel(catalog, { ...baseState, history: [] });
      const tree = History({ viewModel });
      const texts = collectText(tree).join(' ');

      expect(texts).toContain('Transaction History & Audit Trail');
      expect(texts).toContain('◇ No recorded transactions');
      expect(texts).toContain('Recommended actions:');
      expect(texts).toContain('[<Space> a]');
      expect(texts).toContain('[<Space> b]');
      expect(texts).toContain('[<Space> i]');
    });

    test('renders transaction timeline with applied, failed, and rolled_back status badges', () => {
      const viewModel: TuiViewModel = {
        ...createTuiViewModel(catalog, baseState),
        history: [
          {
            action: 'bootstrap',
            result: 'applied',
            occurredAt: '2026-09-01T10:00:00.000Z',
            planId: 'plan-boot-01',
            targets: ['~/.zshrc'],
            details: 'Symlink created and verified',
          },
          {
            action: 'update',
            result: 'failed',
            occurredAt: '2026-09-01T11:00:00.000Z',
            planId: 'plan-upd-02',
            targets: ['~/.config/mzsh'],
            details: 'Syntax validation failed on legacy alias',
          },
          {
            action: 'rollback',
            result: 'rolled_back',
            occurredAt: '2026-09-01T12:00:00.000Z',
            planId: 'plan-roll-03',
            targets: ['~/.zshrc'],
            details: 'Restored pre-adoption snapshot',
          },
        ],
      };

      const tree = History({ viewModel });
      const texts = collectText(tree).join(' ');

      expect(texts).toContain('Transaction Timeline (3 events)');
      expect(texts).toContain('Action: BOOTSTRAP');
      expect(texts).toContain('[✔ APPLIED]');
      expect(texts).toContain('plan-boot-01');
      expect(texts).toContain('Symlink created and verified');

      expect(texts).toContain('Action: UPDATE');
      expect(texts).toContain('[✖ FAILED]');
      expect(texts).toContain('plan-upd-02');
      expect(texts).toContain('Syntax validation failed on legacy alias');

      expect(texts).toContain('Action: ROLLBACK');
      expect(texts).toContain('[↺ ROLLED_BACK]');
      expect(texts).toContain('plan-roll-03');
      expect(texts).toContain('Restored pre-adoption snapshot');

      const appliedColored = collectColoredText(tree, '#a3be8c');
      expect(appliedColored.some((t) => t.includes('[✔ APPLIED]'))).toBe(true);

      const failedColored = collectColoredText(tree, '#bf616a');
      expect(failedColored.some((t) => t.includes('[✖ FAILED]'))).toBe(true);

      const rolledBackColored = collectColoredText(tree, '#ebcb8b');
      expect(rolledBackColored.some((t) => t.includes('[↺ ROLLED_BACK]'))).toBe(true);
    });
  });

  describe('Status component', () => {
    test('renders optimal health badge when attention is 0', () => {
      const tree = Status({ inventory: { healthy: 6, attention: 0 } });
      const texts = collectText(tree).join(' ');

      expect(texts).toContain('[✔ OPTIMAL]');
      expect(texts).toContain('✔ 6 healthy');
      expect(texts).toContain('▲ 0 attention');
    });

    test('renders attention badge when attention is greater than 0', () => {
      const tree = Status({ inventory: { healthy: 4, attention: 3 } });
      const texts = collectText(tree).join(' ');

      expect(texts).toContain('[▲ ATTENTION]');
      expect(texts).toContain('✔ 4 healthy');
      expect(texts).toContain('▲ 3 attention');
    });

    test('renders total count when detailed prop is enabled', () => {
      const tree = Status({ inventory: { healthy: 4, attention: 2 }, detailed: true });
      const texts = collectText(tree).join(' ');

      expect(texts).toContain('● 6 total components');
    });
  });

  describe('ActionStrip component', () => {
    test('renders actions with distinct risk visual cues and formatted shortcuts', () => {
      const viewModel = createTuiViewModel(catalog, baseState);
      const tree = ActionStrip({ actions: viewModel.actions });
      const texts = collectText(tree).join(' ');

      expect(texts).toContain('[<Space> a]');
      expect(texts).toContain('◇ Audit');

      expect(texts).toContain('[<Space> b]');
      expect(texts).toContain('⚡ Bootstrap');
      expect(texts).toContain('(review required)');

      expect(texts).toContain('[<Space> i]');
      expect(texts).toContain('◇ Inventory');

      const destructiveColored = collectColoredText(tree, '#bf616a');
      expect(destructiveColored.some((t) => t.includes('(review required)'))).toBe(true);
    });
  });
});
