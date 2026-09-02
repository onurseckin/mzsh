import { describe, expect, test } from 'bun:test';
import { DagGraph } from '../../../src/domain/dag/dag-graph';
import { renderDag } from '../../../src/domain/dag/dag-renderer';

describe('DagRenderer', () => {
  describe('empty and single node graphs', () => {
    test('renders empty graph message', () => {
      const graph = new DagGraph();
      expect(renderDag(graph)).toBe('(empty graph)');
      expect(renderDag(graph, { format: 'compact' })).toBe('(empty graph)');
      expect(renderDag(graph, { format: 'tree' })).toBe('(empty graph)');
    });

    test('renders single node in box format', () => {
      const graph = new DagGraph();
      graph.addNode({ id: 'init', name: 'Initialize', status: 'completed', durationMs: 45 });

      const output = renderDag(graph, { format: 'box', unicode: true });
      expect(output).toContain('┌');
      expect(output).toContain('┐');
      expect(output).toContain('└');
      expect(output).toContain('┘');
      expect(output).toContain('[✔] Initialize (45ms)');
    });
  });

  describe('box format rendering', () => {
    test('renders diamond DAG with Unicode connectors and box frames', () => {
      const graph = new DagGraph();
      graph.addNode({ id: 'build', name: 'Build', status: 'completed', durationMs: 100 });
      graph.addNode({ id: 'test1', name: 'Test 1', status: 'completed', durationMs: 50 });
      graph.addNode({ id: 'test2', name: 'Test 2', status: 'failed', durationMs: 40 });
      graph.addNode({ id: 'deploy', name: 'Deploy', status: 'blocked' });

      graph.addEdge('build', 'test1');
      graph.addEdge('build', 'test2');
      graph.addEdge('test1', 'deploy');
      graph.addEdge('test2', 'deploy');

      const output = renderDag(graph, { format: 'box', unicode: true });

      expect(output).toContain('[✔] Build (100ms)');
      expect(output).toContain('[✔] Test 1 (50ms)');
      expect(output).toContain('[✖] Test 2 (40ms)');
      expect(output).toContain('[⊘] Deploy');
      expect(output).toContain('▼');
      expect(output).toContain('│');
      expect(output).toContain('┌');
      expect(output).toContain('┘');
    });

    test('renders diamond DAG with ASCII fallback', () => {
      const graph = new DagGraph();
      graph.addNode({ id: 'A', name: 'A', status: 'completed' });
      graph.addNode({ id: 'B', name: 'B', status: 'pending' });
      graph.addEdge('A', 'B');

      const output = renderDag(graph, { format: 'box', unicode: false });
      expect(output).toContain('+');
      expect(output).toContain('|');
      expect(output).toContain('v');
      expect(output).toContain('[+] A');
      expect(output).toContain('[ ] B');
    });
  });

  describe('tree format rendering', () => {
    test('renders hierarchical dependency tree with Unicode branches', () => {
      const graph = new DagGraph();
      graph.addNode({ id: 'root', name: 'Root Task', status: 'completed' });
      graph.addNode({ id: 'sub1', name: 'Subtask 1', status: 'completed' });
      graph.addNode({ id: 'sub2', name: 'Subtask 2', status: 'running' });

      graph.addEdge('root', 'sub1');
      graph.addEdge('root', 'sub2');

      const output = renderDag(graph, { format: 'tree', unicode: true });
      expect(output).toContain('[✔] Root Task');
      expect(output).toContain('├── [✔] Subtask 1');
      expect(output).toContain('└── [▶] Subtask 2');
    });

    test('renders tree with ASCII branches', () => {
      const graph = new DagGraph();
      graph.addNode({ id: 'root', name: 'Root Task', status: 'completed' });
      graph.addNode({ id: 'sub1', name: 'Subtask 1', status: 'completed' });
      graph.addNode({ id: 'sub2', name: 'Subtask 2', status: 'pending' });

      graph.addEdge('root', 'sub1');
      graph.addEdge('root', 'sub2');

      const output = renderDag(graph, { format: 'tree', unicode: false });
      expect(output).toContain('[+] Root Task');
      expect(output).toContain('|-- [+] Subtask 1');
      expect(output).toContain('\\-- [ ] Subtask 2');
    });
  });

  describe('compact format rendering', () => {
    test('renders levels with single-line summaries', () => {
      const graph = new DagGraph();
      graph.addNode({ id: 'A', name: 'A', status: 'completed', durationMs: 10 });
      graph.addNode({ id: 'B1', name: 'B1', status: 'completed', durationMs: 20 });
      graph.addNode({ id: 'B2', name: 'B2', status: 'running', durationMs: 30 });
      graph.addNode({ id: 'C', name: 'C', status: 'pending' });

      graph.addEdge('A', 'B1');
      graph.addEdge('A', 'B2');
      graph.addEdge('B1', 'C');
      graph.addEdge('B2', 'C');

      const output = renderDag(graph, { format: 'compact', unicode: true });
      expect(output).toContain('Level 0: [✔] A (10ms)');
      expect(output).toContain('↓');
      expect(output).toContain('Level 1: [✔] B1 (20ms)  [▶] B2 (30ms)');
      expect(output).toContain('Level 2: [○] C');
    });

    test('renders compact in ASCII mode', () => {
      const graph = new DagGraph();
      graph.addEdge('A', 'B');

      const output = renderDag(graph, { format: 'compact', unicode: false });
      expect(output).toContain('Level 0: [ ] A');
      expect(output).toContain('v');
      expect(output).toContain('Level 1: [ ] B');
    });
  });

  describe('options: status, duration, critical path', () => {
    test('highlights critical path nodes with star indicator', () => {
      const graph = new DagGraph();
      graph.addNode({ id: 'A', name: 'A', status: 'completed', durationMs: 10 });
      graph.addNode({ id: 'B_fast', name: 'B Fast', status: 'completed', durationMs: 5 });
      graph.addNode({ id: 'B_slow', name: 'B Slow', status: 'completed', durationMs: 50 });
      graph.addNode({ id: 'C', name: 'C', status: 'completed', durationMs: 10 });

      graph.addEdge('A', 'B_fast');
      graph.addEdge('A', 'B_slow');
      graph.addEdge('B_fast', 'C');
      graph.addEdge('B_slow', 'C');

      const output = renderDag(graph, {
        format: 'compact',
        unicode: true,
        highlightCriticalPath: true,
      });

      expect(output).toContain('[✔] A (10ms) ★');
      expect(output).toContain('[✔] B Slow (50ms) ★');
      expect(output).toContain('[✔] B Fast (5ms)');
      expect(output).not.toContain('[✔] B Fast (5ms) ★');
      expect(output).toContain('[✔] C (10ms) ★');
    });

    test('hides status and duration when disabled in options', () => {
      const graph = new DagGraph();
      graph.addNode({ id: 'task', name: 'MyTask', status: 'completed', durationMs: 150 });

      const output = renderDag(graph, {
        format: 'compact',
        showStatus: false,
        showDuration: false,
      });

      expect(output).toBe('Level 0: MyTask');
      expect(output).not.toContain('[✔]');
      expect(output).not.toContain('(150ms)');
    });
  });

  describe('cycle reporting', () => {
    test('reports cycle error in renderer without crashing', () => {
      const graph = new DagGraph();
      graph.addEdge('A', 'B');
      graph.addEdge('B', 'A');

      const output = renderDag(graph);
      expect(output).toContain('[Cycle detected: A -> B -> A]');
    });
  });
});
