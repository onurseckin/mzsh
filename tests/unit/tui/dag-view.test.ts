import { describe, expect, test } from 'bun:test';
import { DagWorkflowService, PREDEFINED_WORKFLOWS } from '../../../src/application/dag/dag-service';
import { DagView } from '../../../src/tui/components/dag-view';

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

function collectBorderColors(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return [];
  }
  if (Array.isArray(node)) {
    return node.flatMap(collectBorderColors);
  }
  if (isReactElement(node)) {
    const results: string[] = [];
    if (typeof node.props.borderColor === 'string') {
      results.push(node.props.borderColor);
    }
    results.push(...collectBorderColors(node.props.children));
    return results;
  }
  return [];
}

describe('DagView component', () => {
  const dagService = new DagWorkflowService();
  const workflow = PREDEFINED_WORKFLOWS[0]!; // mzsh-bootstrap
  const graph = dagService.createGraph(workflow);
  const plan = dagService.getExecutionPlan(workflow);

  test('renders execution waves and all tasks for predefined workflow', () => {
    const tree = DagView({
      workflow,
      graph,
      executionPlan: plan,
      selectedTaskId: 'validate-env',
    });
    const texts = collectText(tree).join(' ');

    expect(texts).toContain('Topological Waves Execution Grid');
    expect(texts).toContain('Wave 1');
    expect(texts).toContain('Wave 2');
    expect(texts).toContain('Wave 3');
    expect(texts).toContain('Wave 4');
    expect(texts).toContain('Validate Environment');
    expect(texts).toContain('Backup Legacy Configs');
    expect(texts).toContain('Install Shell Modules');
    expect(texts).toContain('Compile Loader Scripts');
    expect(texts).toContain('Link Binary Shims');
    expect(texts).toContain('Verify Installation');
    expect(texts).toContain('──▶');
  });

  test('renders task cards with status badges and appropriate colors', () => {
    const projectedGraph = dagService.projectState(workflow, {
      'validate-env': 'completed',
      'backup-legacy': 'running',
      'install-modules': 'failed',
    });

    const tree = DagView({
      workflow,
      graph: projectedGraph,
      executionPlan: plan,
      selectedTaskId: 'validate-env',
    });
    const texts = collectText(tree).join(' ');

    expect(texts).toContain('[✔] COMPLETED');
    expect(texts).toContain('[▶] RUNNING');
    expect(texts).toContain('[✖] FAILED');
    expect(texts).toContain('[⊘] BLOCKED');

    const completedTexts = collectColoredText(tree, '#a3be8c');
    expect(completedTexts.some((t) => t.includes('[✔] COMPLETED'))).toBe(true);

    const runningTexts = collectColoredText(tree, '#ebcb8b');
    expect(runningTexts.some((t) => t.includes('[▶] RUNNING'))).toBe(true);

    const failedTexts = collectColoredText(tree, '#bf616a');
    expect(failedTexts.some((t) => t.includes('[✖] FAILED'))).toBe(true);

    const blockedTexts = collectColoredText(tree, '#d08770');
    expect(blockedTexts.some((t) => t.includes('[⊘] BLOCKED'))).toBe(true);
  });

  test('highlights selected task card with border color and selection indicator', () => {
    const tree = DagView({
      workflow,
      graph,
      executionPlan: plan,
      selectedTaskId: 'install-modules',
    });
    const texts = collectText(tree).join(' ');

    expect(texts).toContain('▶ Install Shell Modules');
    const borderColors = collectBorderColors(tree);
    expect(borderColors).toContain('#88c0d0');
  });

  test('renders critical path indicator ★ CRITICAL when enabled', () => {
    const treeWithCrit = DagView({
      workflow,
      graph,
      executionPlan: plan,
      selectedTaskId: 'validate-env',
      highlightCriticalPath: true,
    });
    const textsWithCrit = collectText(treeWithCrit).join(' ');
    expect(textsWithCrit).toContain('★ CRITICAL');

    const treeWithoutCrit = DagView({
      workflow,
      graph,
      executionPlan: plan,
      selectedTaskId: 'validate-env',
      highlightCriticalPath: false,
    });
    const textsWithoutCrit = collectText(treeWithoutCrit).join(' ');
    expect(textsWithoutCrit).not.toContain('★ CRITICAL');
  });

  test('renders Node Details panel with task details, dependencies, dependents, command, and tags', () => {
    const tree = DagView({
      workflow,
      graph,
      executionPlan: plan,
      selectedTaskId: 'validate-env',
    });
    const texts = collectText(tree).join(' ');

    expect(texts).toContain('Task Details: Validate Environment');
    expect(texts).toContain('Task Name & ID: Validate Environment [validate-env]');
    expect(texts).toContain('Probe environment preconditions and dependencies');
    expect(texts).toContain('Status: [○] PENDING — Task is queued awaiting upstream completion.');
    expect(texts).toContain('Upstream Dependencies (0):');
    expect(texts).toContain('None (Root task — execution ready at Wave 1)');
    expect(texts).toContain('Downstream Dependents (3):');
    expect(texts).toContain('backup-legacy');
    expect(texts).toContain('install-modules');
    expect(texts).toContain('link-shims');
    expect(texts).toContain('Estimated Duration: 120ms');
    expect(texts).toContain('Command: bun run mzsh -- audit');
    expect(texts).toContain('Tags: audit, preflight');
  });

  test('renders downstream and upstream dependencies for intermediate node in details panel', () => {
    const tree = DagView({
      workflow,
      graph,
      executionPlan: plan,
      selectedTaskId: 'verify-setup',
    });
    const texts = collectText(tree).join(' ');

    expect(texts).toContain('Task Details: Verify Installation');
    expect(texts).toContain('Upstream Dependencies (3):');
    expect(texts).toContain('backup-legacy');
    expect(texts).toContain('compile-loader');
    expect(texts).toContain('link-shims');
    expect(texts).toContain('Downstream Dependents (0):');
    expect(texts).toContain('None (Leaf task — terminal workflow node)');
  });

  test('renders compact layout when isCompact is true', () => {
    const tree = DagView({
      workflow,
      graph,
      executionPlan: plan,
      selectedTaskId: 'validate-env',
      isCompact: true,
    });
    const texts = collectText(tree).join(' ');

    expect(texts).toContain('▼');
    expect(texts).not.toContain('──▶');
  });

  test('filters tasks according to filterStatus', () => {
    const projectedGraph = dagService.projectState(workflow, {
      'validate-env': 'completed',
      'backup-legacy': 'completed',
    });

    const tree = DagView({
      workflow,
      graph: projectedGraph,
      executionPlan: plan,
      selectedTaskId: 'validate-env',
      filterStatus: 'completed',
    });
    const texts = collectText(tree).join(' ');

    expect(texts).toContain('Validate Environment');
    expect(texts).toContain('Backup Legacy Configs');
    expect(texts).toContain('No matching tasks');
  });
});
