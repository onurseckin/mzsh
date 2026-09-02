import { describe, expect, test } from 'bun:test';
import { DagGraph } from '../../../src/domain/dag/dag-graph';
import type { DagNode } from '../../../src/domain/dag/dag-types';

describe('DagGraph', () => {
  describe('graph construction', () => {
    test('creates empty graph', () => {
      const graph = new DagGraph();
      expect(graph.getNodes()).toHaveLength(0);
      expect(graph.getEdges()).toHaveLength(0);
    });

    test('adds and retrieves nodes', () => {
      const graph = new DagGraph();
      const nodeA: DagNode = {
        id: 'build',
        name: 'Build Artifacts',
        summary: 'Compiles TS code',
        status: 'pending',
        durationMs: 120,
        metadata: { env: 'prod' },
      };

      graph.addNode(nodeA);
      expect(graph.getNode('build')).toEqual(nodeA);
      expect(graph.getNodes()).toHaveLength(1);
    });

    test('adds edges and auto-creates missing nodes with pending status', () => {
      const graph = new DagGraph();
      graph.addEdge('nodeA', 'nodeB', 'depends_on');

      expect(graph.getNode('nodeA')).toEqual({
        id: 'nodeA',
        name: 'nodeA',
        status: 'pending',
      });
      expect(graph.getNode('nodeB')).toEqual({
        id: 'nodeB',
        name: 'nodeB',
        status: 'pending',
      });

      const edges = graph.getEdges();
      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual({ from: 'nodeA', to: 'nodeB', label: 'depends_on' });
    });

    test('creates graph fromNodesAndEdges factory', () => {
      const nodes: DagNode[] = [
        { id: '1', name: 'First', status: 'completed' },
        { id: '2', name: 'Second', status: 'pending' },
      ];
      const edges = [{ from: '1', to: '2' }];

      const graph = DagGraph.fromNodesAndEdges(nodes, edges);
      expect(graph.getNodes()).toHaveLength(2);
      expect(graph.getEdges()).toHaveLength(1);
      expect(graph.getUpstream('2')).toEqual(['1']);
      expect(graph.getDownstream('1')).toEqual(['2']);
    });
  });

  describe('dependencies and dependents traversal', () => {
    test('retrieves immediate upstream and downstream nodes', () => {
      const graph = new DagGraph();
      graph.addEdge('A', 'B');
      graph.addEdge('A', 'C');
      graph.addEdge('B', 'D');
      graph.addEdge('C', 'D');

      expect(graph.getDownstream('A')).toEqual(['B', 'C']);
      expect(graph.getUpstream('D')).toEqual(['B', 'C']);
      expect(graph.getUpstream('A')).toEqual([]);
      expect(graph.getDownstream('D')).toEqual([]);
    });

    test('retrieves transitive dependencies (upstream ancestors)', () => {
      const graph = new DagGraph();
      graph.addEdge('A', 'B');
      graph.addEdge('B', 'C');
      graph.addEdge('C', 'D');
      graph.addEdge('X', 'B');

      const depsOfD = graph.getTransitiveDependencies('D');
      expect(depsOfD).toContain('A');
      expect(depsOfD).toContain('B');
      expect(depsOfD).toContain('C');
      expect(depsOfD).toContain('X');
      expect(depsOfD).not.toContain('D');
      expect(depsOfD).toHaveLength(4);
    });

    test('retrieves transitive dependents (downstream descendants)', () => {
      const graph = new DagGraph();
      graph.addEdge('A', 'B');
      graph.addEdge('A', 'C');
      graph.addEdge('B', 'D');
      graph.addEdge('C', 'E');
      graph.addEdge('D', 'F');

      const dependentsOfA = graph.getTransitiveDependents('A');
      expect(dependentsOfA).toContain('B');
      expect(dependentsOfA).toContain('C');
      expect(dependentsOfA).toContain('D');
      expect(dependentsOfA).toContain('E');
      expect(dependentsOfA).toContain('F');
      expect(dependentsOfA).toHaveLength(5);
    });
  });

  describe('cycle detection', () => {
    test('detects no cycle in linear graph', () => {
      const graph = new DagGraph();
      graph.addEdge('A', 'B');
      graph.addEdge('B', 'C');

      const result = graph.detectCycles();
      expect(result.hasCycle).toBeFalse();
      expect(result.cyclePath).toBeUndefined();
    });

    test('detects single node self-loop cycle', () => {
      const graph = new DagGraph();
      graph.addEdge('A', 'A');

      const result = graph.detectCycles();
      expect(result.hasCycle).toBeTrue();
      expect(result.cyclePath).toEqual(['A', 'A']);
    });

    test('detects 2-node cycle', () => {
      const graph = new DagGraph();
      graph.addEdge('A', 'B');
      graph.addEdge('B', 'A');

      const result = graph.detectCycles();
      expect(result.hasCycle).toBeTrue();
      expect(result.cyclePath).toEqual(['A', 'B', 'A']);
    });

    test('detects 3-node cycle in a larger graph', () => {
      const graph = new DagGraph();
      graph.addEdge('start', 'A');
      graph.addEdge('A', 'B');
      graph.addEdge('B', 'C');
      graph.addEdge('C', 'A');
      graph.addEdge('C', 'end');

      const result = graph.detectCycles();
      expect(result.hasCycle).toBeTrue();
      expect(result.cyclePath).toEqual(['A', 'B', 'C', 'A']);
    });
  });

  describe('topological sorting', () => {
    test('sorts linear chain', () => {
      const graph = new DagGraph();
      graph.addEdge('compile', 'test');
      graph.addEdge('test', 'deploy');

      const result = graph.topologicalSort();
      expect(result.success).toBeTrue();
      if (result.success) {
        expect(result.order).toEqual(['compile', 'test', 'deploy']);
      }
    });

    test('sorts branching diamond DAG with valid prerequisite order', () => {
      const graph = new DagGraph();
      graph.addEdge('build', 'test_unit');
      graph.addEdge('build', 'test_lint');
      graph.addEdge('test_unit', 'package');
      graph.addEdge('test_lint', 'package');

      const result = graph.topologicalSort();
      expect(result.success).toBeTrue();
      if (result.success) {
        const order = result.order;
        expect(order.indexOf('build')).toBeLessThan(order.indexOf('test_unit'));
        expect(order.indexOf('build')).toBeLessThan(order.indexOf('test_lint'));
        expect(order.indexOf('test_unit')).toBeLessThan(order.indexOf('package'));
        expect(order.indexOf('test_lint')).toBeLessThan(order.indexOf('package'));
      }
    });

    test('returns failure with cycle path when graph has cycles', () => {
      const graph = new DagGraph();
      graph.addEdge('A', 'B');
      graph.addEdge('B', 'A');

      const result = graph.topologicalSort();
      expect(result.success).toBeFalse();
      if (!result.success) {
        expect(result.cycle).toEqual(['A', 'B', 'A']);
      }
    });
  });

  describe('level computation', () => {
    test('computes parallel execution ranks for diamond DAG', () => {
      const graph = new DagGraph();
      graph.addEdge('build', 'test1');
      graph.addEdge('build', 'test2');
      graph.addEdge('build', 'test3');
      graph.addEdge('test1', 'deploy');
      graph.addEdge('test2', 'deploy');
      graph.addEdge('test3', 'deploy');

      const levels = graph.computeLevels();
      expect(levels).toHaveLength(3);
      expect(levels[0]).toEqual({ levelIndex: 0, nodeIds: ['build'] });
      expect(levels[1]?.nodeIds).toEqual(['test1', 'test2', 'test3']);
      expect(levels[2]).toEqual({ levelIndex: 2, nodeIds: ['deploy'] });
    });

    test('returns empty array for empty graph', () => {
      const graph = new DagGraph();
      expect(graph.computeLevels()).toEqual([]);
    });

    test('throws error if computing levels on graph with cycles', () => {
      const graph = new DagGraph();
      graph.addEdge('A', 'B');
      graph.addEdge('B', 'A');

      expect(() => graph.computeLevels()).toThrow('DAG contains cycles');
    });
  });

  describe('critical path computation', () => {
    test('computes critical path using node durationMs', () => {
      const graph = new DagGraph();
      graph.addNode({ id: 'A', name: 'A', status: 'completed', durationMs: 100 });
      graph.addNode({ id: 'B_fast', name: 'B fast', status: 'completed', durationMs: 50 });
      graph.addNode({ id: 'B_slow', name: 'B slow', status: 'completed', durationMs: 250 });
      graph.addNode({ id: 'C', name: 'C', status: 'pending', durationMs: 30 });

      graph.addEdge('A', 'B_fast');
      graph.addEdge('A', 'B_slow');
      graph.addEdge('B_fast', 'C');
      graph.addEdge('B_slow', 'C');

      const result = graph.computeCriticalPath();
      expect(result.path).toEqual(['A', 'B_slow', 'C']);
      expect(result.totalDurationMs).toBe(380); // 100 + 250 + 30
    });

    test('allows custom duration overrides', () => {
      const graph = new DagGraph();
      graph.addNode({ id: 'A', name: 'A', status: 'completed', durationMs: 100 });
      graph.addNode({ id: 'B1', name: 'B1', status: 'completed', durationMs: 50 });
      graph.addNode({ id: 'B2', name: 'B2', status: 'completed', durationMs: 250 });
      graph.addNode({ id: 'C', name: 'C', status: 'pending', durationMs: 30 });

      graph.addEdge('A', 'B1');
      graph.addEdge('A', 'B2');
      graph.addEdge('B1', 'C');
      graph.addEdge('B2', 'C');

      // Override B1 to be longer than B2
      const result = graph.computeCriticalPath({ B1: 500 });
      expect(result.path).toEqual(['A', 'B1', 'C']);
      expect(result.totalDurationMs).toBe(630); // 100 + 500 + 30
    });

    test('handles empty graph', () => {
      const graph = new DagGraph();
      const result = graph.computeCriticalPath();
      expect(result.path).toEqual([]);
      expect(result.totalDurationMs).toBe(0);
    });
  });

  describe('status projection', () => {
    test('projects executed statuses and automatically blocks descendants of failed nodes', () => {
      const graph = new DagGraph();
      graph.addEdge('setup', 'build');
      graph.addEdge('build', 'test_unit');
      graph.addEdge('build', 'test_lint');
      graph.addEdge('test_unit', 'deploy');
      graph.addEdge('test_lint', 'deploy');

      const projected = graph.projectStatuses({
        setup: 'completed',
        build: 'failed',
      });

      expect(projected.getNode('setup')?.status).toBe('completed');
      expect(projected.getNode('build')?.status).toBe('failed');
      expect(projected.getNode('test_unit')?.status).toBe('blocked');
      expect(projected.getNode('test_lint')?.status).toBe('blocked');
      expect(projected.getNode('deploy')?.status).toBe('blocked');
    });

    test('preserves running and completed nodes unaffected by failure', () => {
      const graph = new DagGraph();
      graph.addEdge('root1', 'leaf1');
      graph.addEdge('root2', 'leaf2');

      const projected = graph.projectStatuses({
        root1: 'failed',
        root2: 'completed',
        leaf2: 'running',
      });

      expect(projected.getNode('root1')?.status).toBe('failed');
      expect(projected.getNode('leaf1')?.status).toBe('blocked');
      expect(projected.getNode('root2')?.status).toBe('completed');
      expect(projected.getNode('leaf2')?.status).toBe('running');
    });
  });
});
