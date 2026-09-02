import { describe, expect, test } from 'bun:test';
import { catalog } from '../../../src/catalog/command-catalog';
import { DagScreen } from '../../../src/tui/screens/dag-screen';
import { createTuiViewModel, type TuiState } from '../../../src/tui/types';

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
    let componentChildrenText: string[] = [];
    if (typeof node.type === 'function') {
      const componentFn = node.type as (props: unknown) => unknown;
      componentChildrenText = collectText(componentFn(node.props));
    }
    const childrenText = collectText(node.props.children);
    return [...titleText, ...componentChildrenText, ...childrenText];
  }
  return [];
}

describe('DagScreen component', () => {
  const baseState: TuiState = {
    screen: 'dag',
    inventory: { healthy: 4, attention: 0 },
    history: [],
    envMode: 'development',
    shell: '/bin/zsh',
    os: 'darwin',
  };

  const viewModel = createTuiViewModel(catalog, baseState);

  test('renders header summary metrics bar with active workflow, task count, waves, concurrency, and critical path', () => {
    const tree = DagScreen({ viewModel, workflowIndex: 0 });
    const texts = collectText(tree).join(' ');

    expect(texts).toContain('Active Workflow: MZSH Bootstrap (mzsh-bootstrap)');
    expect(texts).toContain('Total Tasks: 6');
    expect(texts).toContain('Execution Waves: 4');
    expect(texts).toContain('Max Concurrency: 3');
    expect(texts).toContain('Critical Path:');
    expect(texts).toContain('4 tasks (660ms)');
    expect(texts).toContain('○ 6 Pending');
    expect(texts).toContain('Simulation: Idle (all pending)');
  });

  test('cycles workflows and updates summary metrics for MZSH Audit & Auto-Fix', () => {
    const tree = DagScreen({ viewModel, workflowIndex: 1 });
    const texts = collectText(tree).join(' ');

    expect(texts).toContain('Active Workflow: MZSH Audit & Auto-Fix (mzsh-audit-fix)');
    expect(texts).toContain('Total Tasks: 6');
    expect(texts).toContain('Execution Waves: 5');
    expect(texts).toContain('Max Concurrency: 2');
    expect(texts).toContain('Probe System Health');
    expect(texts).toContain('Detect Configuration Drift');
    expect(texts).toContain('Repair File Permissions');
  });

  test('cycles workflows and updates summary metrics for MZSH CI Pipeline', () => {
    const tree = DagScreen({ viewModel, workflowIndex: 2 });
    const texts = collectText(tree).join(' ');

    expect(texts).toContain('Active Workflow: MZSH CI Pipeline (mzsh-ci-pipeline)');
    expect(texts).toContain('Total Tasks: 5');
    expect(texts).toContain('Execution Waves: 3');
    expect(texts).toContain('ESLint & Formatting');
    expect(texts).toContain('TypeScript Typecheck');
    expect(texts).toContain('Unit Tests');
    expect(texts).toContain('Integration Tests');
    expect(texts).toContain('Package Validation');
  });

  test('updates task selection state and inspects selected task details', () => {
    const tree = DagScreen({
      viewModel,
      workflowIndex: 0,
      selectedTaskId: 'compile-loader',
    });
    const texts = collectText(tree).join(' ');

    expect(texts).toContain('Task Details: Compile Loader Scripts');
    expect(texts).toContain('Task Name & ID: Compile Loader Scripts [compile-loader]');
    expect(texts).toContain('Generate optimized entrypoint loader and compiled scripts');
    expect(texts).toContain('Upstream Dependencies (1):');
    expect(texts).toContain('install-modules');
  });

  test('updates simulation state step-by-step', () => {
    // Sim Step 1: Wave 1 is running
    const treeStep1 = DagScreen({
      viewModel,
      workflowIndex: 0,
      simStep: 1,
    });
    const textsStep1 = collectText(treeStep1).join(' ');
    expect(textsStep1).toContain('▶ 1 Running');
    expect(textsStep1).toContain('○ 5 Pending');
    expect(textsStep1).toContain('Simulation: Wave 1/4');

    // Sim Step 2: Wave 1 completed, Wave 2 running
    const treeStep2 = DagScreen({
      viewModel,
      workflowIndex: 0,
      simStep: 2,
    });
    const textsStep2 = collectText(treeStep2).join(' ');
    expect(textsStep2).toContain('✔ 1 Completed');
    expect(textsStep2).toContain('▶ 3 Running');
    expect(textsStep2).toContain('○ 2 Pending');
    expect(textsStep2).toContain('Simulation: Wave 2/4');

    // Sim Step 5: Complete
    const treeStep5 = DagScreen({
      viewModel,
      workflowIndex: 0,
      simStep: 5,
    });
    const textsStep5 = collectText(treeStep5).join(' ');
    expect(textsStep5).toContain('✔ 6 Completed');
    expect(textsStep5).toContain('Simulation: Complete');
  });

  test('toggles critical path indicator', () => {
    const treeWithCrit = DagScreen({
      viewModel,
      workflowIndex: 0,
      highlightCriticalPath: true,
    });
    const textsWithCrit = collectText(treeWithCrit).join(' ');
    expect(textsWithCrit).toContain('[c] crit path (ON)');
    expect(textsWithCrit).toContain('★ CRITICAL');

    const treeWithoutCrit = DagScreen({
      viewModel,
      workflowIndex: 0,
      highlightCriticalPath: false,
    });
    const textsWithoutCrit = collectText(treeWithoutCrit).join(' ');
    expect(textsWithoutCrit).toContain('[c] crit path (OFF)');
    expect(textsWithoutCrit).not.toContain('★ CRITICAL');
  });

  test('applies status filter and shows filter in bottom controls bar', () => {
    const tree = DagScreen({
      viewModel,
      workflowIndex: 0,
      filterStatus: 'running',
    });
    const texts = collectText(tree).join(' ');

    expect(texts).toContain('[f/s] filter (running)');
    expect(texts).toContain('No matching tasks');
  });

  test('renders bottom shortcut help bar with all DAG controls', () => {
    const tree = DagScreen({ viewModel });
    const texts = collectText(tree).join(' ');

    expect(texts).toContain('[w] workflow');
    expect(texts).toContain('[c] crit path');
    expect(texts).toContain('[f/s] filter');
    expect(texts).toContain('[r/space] sim step');
    expect(texts).toContain('[j/k] select task');
    expect(texts).toContain('x reset sim');
    expect(texts).toContain('? full help');
  });
});
