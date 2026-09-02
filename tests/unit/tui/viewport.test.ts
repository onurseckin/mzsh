import { describe, expect, test } from 'bun:test';
import { catalog } from '../../../src/catalog/command-catalog';
import { ActionStrip } from '../../../src/tui/components/actions';
import { Header } from '../../../src/tui/components/header';
import { HelpOverlay } from '../../../src/tui/components/help-overlay';
import { Status } from '../../../src/tui/components/status';
import { Dashboard } from '../../../src/tui/screens/dashboard';
import { History } from '../../../src/tui/screens/history';
import { PlanReview } from '../../../src/tui/screens/plan-review';
import {
  createTuiViewModel,
  resolveViewportProfile,
  TUI_VIEWPORT_PROFILES,
  type TuiState,
  type TuiViewportProfileName,
} from '../../../src/tui/types';

interface GenericReactElement {
  readonly type: unknown;
  readonly props: {
    readonly children?: unknown;
    readonly title?: string;
    readonly titleColor?: string;
    readonly borderColor?: string;
    readonly borderStyle?: string;
    readonly style?: {
      readonly flexDirection?: string;
      readonly flexWrap?: string;
      readonly flexGrow?: number;
      readonly width?: string;
      readonly [key: string]: unknown;
    };
    readonly fg?: string;
    readonly [key: string]: unknown;
  };
}

function isReactElement(value: unknown): value is GenericReactElement {
  return typeof value === 'object' && value !== null && 'props' in value;
}

function collectText(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (isReactElement(node)) {
    const titleText = node.props.title !== undefined ? [node.props.title] : [];
    return [...titleText, ...collectText(node.props.children)];
  }
  return [];
}

function collectFgColors(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(collectFgColors);
  if (isReactElement(node)) {
    const colors: string[] = [];
    if (node.props.fg !== undefined) colors.push(node.props.fg);
    if (node.props.titleColor !== undefined) colors.push(node.props.titleColor);
    if (node.props.borderColor !== undefined) colors.push(node.props.borderColor);
    return [...colors, ...collectFgColors(node.props.children)];
  }
  return [];
}

function collectElements(node: unknown): GenericReactElement[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(collectElements);
  if (isReactElement(node)) {
    return [node, ...collectElements(node.props.children)];
  }
  return [];
}

describe('OpenTUI 4-Tier Multi-Viewport Responsiveness & Craft', () => {
  const baseState: TuiState = {
    screen: 'dashboard',
    inventory: { healthy: 5, attention: 1 },
    history: [
      {
        action: 'bootstrap',
        result: 'applied',
        occurredAt: '2026-09-01T10:00:00.000Z',
        planId: 'plan-boot-01',
        targets: ['~/.zshrc'],
      },
      {
        action: 'update',
        result: 'failed',
        occurredAt: '2026-09-01T11:00:00.000Z',
        planId: 'plan-upd-02',
        targets: ['~/.config/mzsh'],
      },
    ],
    plan: {
      action: 'bootstrap',
      reviewedPlanId: 'plan-bootstrap-101',
      confirmation: 'APPLY',
      affectedTargets: ['~/.zshrc', '~/.config/mzsh'],
    },
    envMode: 'development',
    shell: '/bin/zsh',
    os: 'darwin',
    arch: 'arm64',
  };

  describe('1. Viewport Profile Resolution Matrix', () => {
    test('resolves canonical 4-tier profiles with exact dimension metrics', () => {
      const large = resolveViewportProfile('large-desktop');
      expect(large.name).toBe('large-desktop');
      expect(large.columns).toBe(240);
      expect(large.rows).toBe(60);
      expect(large.isCompact).toBe(false);
      expect(large.isMobile).toBe(false);

      const standard = resolveViewportProfile('standard-laptop');
      expect(standard.name).toBe('standard-laptop');
      expect(standard.columns).toBe(180);
      expect(standard.rows).toBe(45);
      expect(standard.isCompact).toBe(false);
      expect(standard.isMobile).toBe(false);

      const tablet = resolveViewportProfile('tablet-split');
      expect(tablet.name).toBe('tablet-split');
      expect(tablet.columns).toBe(96);
      expect(tablet.rows).toBe(50);
      expect(tablet.isCompact).toBe(true);
      expect(tablet.isMobile).toBe(false);

      const mobile = resolveViewportProfile('mobile-compact');
      expect(mobile.name).toBe('mobile-compact');
      expect(mobile.columns).toBe(48);
      expect(mobile.rows).toBe(35);
      expect(mobile.isCompact).toBe(true);
      expect(mobile.isMobile).toBe(true);
    });

    test('dynamically categorizes arbitrary terminal dimensions to nearest profile', () => {
      expect(resolveViewportProfile({ columns: 220, rows: 55 }).name).toBe('large-desktop');
      expect(resolveViewportProfile({ columns: 160, rows: 40 }).name).toBe('standard-laptop');
      expect(resolveViewportProfile({ columns: 80, rows: 24 }).name).toBe('tablet-split');
      expect(resolveViewportProfile({ columns: 40, rows: 20 }).name).toBe('mobile-compact');
    });

    test('TUI_VIEWPORT_PROFILES exposes all 4 canonical profile presets', () => {
      const keys: TuiViewportProfileName[] = [
        'large-desktop',
        'standard-laptop',
        'tablet-split',
        'mobile-compact',
      ];
      for (const key of keys) {
        expect(TUI_VIEWPORT_PROFILES[key]).toBeDefined();
        expect(TUI_VIEWPORT_PROFILES[key].columns).toBeGreaterThan(0);
      }
    });
  });

  describe('2. Dashboard Responsiveness across Viewports', () => {
    test('renders 2x2 horizontal card grid layout on Large Desktop (240 cols)', () => {
      const viewModel = createTuiViewModel(catalog, { ...baseState, viewport: 'large-desktop' });
      const tree = Dashboard({ viewModel });
      const elements = collectElements(tree);

      const rowContainers = elements.filter(
        (el) => el.props.style?.flexDirection === 'row' && el.props.style?.width === '100%'
      );
      expect(rowContainers.length).toBe(2);

      const texts = collectText(tree).join(' ');
      expect(texts).toContain('System & Environment');
      expect(texts).toContain('Health & Inventory');
      expect(texts).toContain('Audit & Security');
      expect(texts).toContain('Quick Actions');
    });

    test('renders 2x2 horizontal card grid layout on Standard Laptop (180 cols)', () => {
      const viewModel = createTuiViewModel(catalog, { ...baseState, viewport: 'standard-laptop' });
      const tree = Dashboard({ viewModel });
      const elements = collectElements(tree);

      const rowContainers = elements.filter(
        (el) => el.props.style?.flexDirection === 'row' && el.props.style?.width === '100%'
      );
      expect(rowContainers.length).toBe(2);
    });

    test('stacks cards vertically (flexDirection: column) on Tablet / Split-pane (96 cols)', () => {
      const viewModel = createTuiViewModel(catalog, { ...baseState, viewport: 'tablet-split' });
      const tree = Dashboard({ viewModel });
      const elements = collectElements(tree);

      const colContainers = elements.filter(
        (el) => el.props.style?.flexDirection === 'column' && el.props.style?.width === '100%'
      );
      expect(colContainers.length).toBeGreaterThanOrEqual(2);
    });

    test('stacks cards vertically with full wrap support on Mobile / Compact (48 cols)', () => {
      const viewModel = createTuiViewModel(catalog, { ...baseState, viewport: 'mobile-compact' });
      const tree = Dashboard({ viewModel });
      const elements = collectElements(tree);

      const wrappedContainers = elements.filter((el) => el.props.style?.flexWrap === 'wrap');
      expect(wrappedContainers.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('3. PlanReview Responsiveness across Viewports', () => {
    test('renders structured plan with wrapped operations across all 4 viewports', () => {
      const profiles: TuiViewportProfileName[] = [
        'large-desktop',
        'standard-laptop',
        'tablet-split',
        'mobile-compact',
      ];

      for (const profile of profiles) {
        const viewModel = createTuiViewModel(catalog, { ...baseState, viewport: profile });
        const tree = PlanReview({ viewModel });
        const texts = collectText(tree).join(' ');

        expect(texts).toContain('Plan Metadata & Risk Evaluation');
        expect(texts).toContain('BOOTSTRAP');
        expect(texts).toContain('[DESTRUCTIVE]');
        expect(texts).toContain('plan-bootstrap-101');
        expect(texts).toContain('Change Steps & Operations');
        expect(texts).toContain('Safety & Rollback Checklist');
        expect(texts).toContain('Confirmation Required');
        expect(texts).toContain('bun run mzsh -- bootstrap --apply');

        const elements = collectElements(tree);
        const wrappedRows = elements.filter((el) => el.props.style?.flexWrap === 'wrap');
        expect(wrappedRows.length).toBeGreaterThanOrEqual(4);
      }
    });

    test('renders empty plan guide cleanly across all viewports', () => {
      const viewModel = createTuiViewModel(catalog, {
        ...baseState,
        plan: undefined,
        viewport: 'mobile-compact',
      });
      const tree = PlanReview({ viewModel });
      const texts = collectText(tree).join(' ');

      expect(texts).toContain('◇ No pending action plan');
      expect(texts).toContain('Available planning actions:');
      expect(texts).toContain('[<Space> b]');
    });
  });

  describe('4. History Responsiveness across Viewports', () => {
    test('renders transaction timeline with wrap support across all 4 viewports', () => {
      const profiles: TuiViewportProfileName[] = [
        'large-desktop',
        'standard-laptop',
        'tablet-split',
        'mobile-compact',
      ];

      for (const profile of profiles) {
        const viewModel = createTuiViewModel(catalog, { ...baseState, viewport: profile });
        const tree = History({ viewModel });
        const texts = collectText(tree).join(' ');

        expect(texts).toContain('Transaction Timeline (2 events)');
        expect(texts).toContain('Action: BOOTSTRAP');
        expect(texts).toContain('[✔ APPLIED]');
        expect(texts).toContain('Action: UPDATE');
        expect(texts).toContain('[✖ FAILED]');

        const elements = collectElements(tree);
        const wrappedRows = elements.filter((el) => el.props.style?.flexWrap === 'wrap');
        expect(wrappedRows.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('5. HelpOverlay & Header Responsiveness', () => {
    test('adapts HelpOverlay key padding and wrap layout across viewports', () => {
      const desktopVM = createTuiViewModel(catalog, { ...baseState, viewport: 'large-desktop' });
      const mobileVM = createTuiViewModel(catalog, { ...baseState, viewport: 'mobile-compact' });

      const desktopTree = HelpOverlay({ viewModel: desktopVM });
      const mobileTree = HelpOverlay({ viewModel: mobileVM });

      const desktopTexts = collectText(desktopTree).join(' ');
      const mobileTexts = collectText(mobileTree).join(' ');

      expect(desktopTexts).toContain('Navigation Shortcuts');
      expect(desktopTexts).toContain('Actions & Environment');
      expect(desktopTexts).toContain('Global Controls');
      expect(mobileTexts).toContain('Navigation Shortcuts');

      const mobileElements = collectElements(mobileTree);
      const wrappedRows = mobileElements.filter((el) => el.props.style?.flexWrap === 'wrap');
      expect(wrappedRows.length).toBeGreaterThanOrEqual(10);
    });

    test('adapts Header breadcrumbs and badges with flexWrap', () => {
      const viewModel = createTuiViewModel(catalog, { ...baseState, viewport: 'tablet-split' });
      const tree = Header({ viewModel });
      const elements = collectElements(tree);

      const wrappedRows = elements.filter((el) => el.props.style?.flexWrap === 'wrap');
      expect(wrappedRows.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('6. Zero Clipping & ActionStrip Wrapping', () => {
    test('ActionStrip wraps items smoothly for compact terminal viewports', () => {
      const viewModel = createTuiViewModel(catalog, { ...baseState, viewport: 'mobile-compact' });
      const tree = ActionStrip({ actions: viewModel.actions });
      const elements = collectElements(tree);

      expect(elements[0]?.props.style?.flexWrap).toBe('wrap');
      const texts = collectText(tree).join(' ');
      expect(texts).toContain('[<Space> a]');
      expect(texts).toContain('Audit');
    });

    test('Status component wraps items cleanly', () => {
      const tree = Status({ inventory: { healthy: 12, attention: 3 }, detailed: true });
      const elements = collectElements(tree);

      expect(elements[0]?.props.style?.flexWrap).toBe('wrap');
      const texts = collectText(tree).join(' ');
      expect(texts).toContain('[▲ ATTENTION]');
      expect(texts).toContain('✔ 12 healthy');
      expect(texts).toContain('▲ 3 attention');
      expect(texts).toContain('● 15 total components');
    });
  });

  describe('7. APCA Contrast Compliance & Zero Low-Contrast Colors', () => {
    test('verifies all rendered foreground and border colors meet APCA high-contrast standards', () => {
      const allowedHighContrastColors = new Set([
        '#88c0d0', // Frost Cyan (Lc ~76)
        '#81a1c1', // Frost Blue (Lc ~64)
        '#eceff4', // Snow White (Lc ~98)
        '#d8dee9', // Snow Light Gray (Lc ~83)
        '#ebcb8b', // Aurora Yellow (Lc ~84)
        '#a3be8c', // Aurora Green (Lc ~73)
        '#d08770', // Aurora Orange (Lc ~62)
        '#bf616a', // Aurora Red (Lc ~51)
        '#616e88', // Elevated Polar Night (Lc ~49)
        '#434c5e', // Border Gray
        '#3b4252', // Border Dark Single
      ]);

      const viewModel = createTuiViewModel(catalog, baseState);
      const dashboardTree = Dashboard({ viewModel });
      const headerTree = Header({ viewModel });
      const helpTree = HelpOverlay({ viewModel });
      const planTree = PlanReview({ viewModel });
      const historyTree = History({ viewModel });
      const actionsTree = ActionStrip({ actions: viewModel.actions });
      const statusTree = Status({ inventory: viewModel.inventory });

      const allTrees = [
        dashboardTree,
        headerTree,
        helpTree,
        planTree,
        historyTree,
        actionsTree,
        statusTree,
      ];

      const allColors = allTrees.flatMap(collectFgColors);
      expect(allColors.length).toBeGreaterThan(40);

      // Verify NO occurrence of deprecated low-contrast #4c566a
      const deprecatedColors = allColors.filter((c) => c.toLowerCase() === '#4c566a');
      expect(deprecatedColors).toEqual([]);

      // Verify every color is an approved high-contrast color
      for (const color of allColors) {
        expect(allowedHighContrastColors.has(color.toLowerCase())).toBe(true);
      }
    });
  });
});
