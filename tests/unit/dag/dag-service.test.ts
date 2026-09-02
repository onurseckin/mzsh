import { describe, expect, test } from 'bun:test';
import {
  DagWorkflowService,
  type WorkflowDefinition,
} from '../../../src/application/dag/dag-service';

describe('DagWorkflowService', () => {
  const service = new DagWorkflowService();

  describe('createGraph', () => {
    test('creates DagGraph from valid workflow definition', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-wf',
        name: 'Test Workflow',
        tasks: [
          { id: 't1', name: 'Task 1', dependencies: [], estimatedDurationMs: 100 },
          { id: 't2', name: 'Task 2', dependencies: ['t1'], estimatedDurationMs: 200 },
          { id: 't3', name: 'Task 3', dependencies: ['t1'], estimatedDurationMs: 150 },
          { id: 't4', name: 'Task 4', dependencies: ['t2', 't3'], estimatedDurationMs: 50 },
        ],
      };

      const graph = service.createGraph(workflow);
      expect(graph.getNodes()).toHaveLength(4);
      expect(graph.getEdges()).toHaveLength(4);
      expect(graph.getUpstream('t4')).toEqual(['t2', 't3']);
      expect(graph.getDownstream('t1')).toEqual(['t2', 't3']);
    });

    test('throws error on missing dependency', () => {
      const workflow: WorkflowDefinition = {
        id: 'broken-dep',
        name: 'Broken Dep',
        tasks: [{ id: 't1', name: 'Task 1', dependencies: ['non-existent'] }],
      };

      expect(() => service.createGraph(workflow)).toThrow(
        'Task "t1" depends on unknown task "non-existent" in workflow "broken-dep"'
      );
    });

    test('throws error on duplicate task ID', () => {
      const workflow: WorkflowDefinition = {
        id: 'duplicate-id',
        name: 'Duplicate ID',
        tasks: [
          { id: 't1', name: 'Task 1', dependencies: [] },
          { id: 't1', name: 'Task 1 Dup', dependencies: [] },
        ],
      };

      expect(() => service.createGraph(workflow)).toThrow(
        'Duplicate task ID "t1" in workflow "duplicate-id"'
      );
    });

    test('throws error when workflow contains a cycle', () => {
      const workflow: WorkflowDefinition = {
        id: 'cycle-wf',
        name: 'Cycle Workflow',
        tasks: [
          { id: 'a', name: 'Task A', dependencies: ['c'] },
          { id: 'b', name: 'Task B', dependencies: ['a'] },
          { id: 'c', name: 'Task C', dependencies: ['b'] },
        ],
      };

      expect(() => service.createGraph(workflow)).toThrow('Workflow "cycle-wf" contains a cycle');
    });
  });

  describe('getExecutionPlan', () => {
    test('computes parallel execution waves and critical path for diamond workflow', () => {
      const workflow: WorkflowDefinition = {
        id: 'diamond-wf',
        name: 'Diamond Workflow',
        tasks: [
          { id: 'build', name: 'Build', dependencies: [], estimatedDurationMs: 100 },
          { id: 'unit-test', name: 'Unit Test', dependencies: ['build'], estimatedDurationMs: 50 },
          { id: 'lint-test', name: 'Lint Test', dependencies: ['build'], estimatedDurationMs: 200 },
          {
            id: 'deploy',
            name: 'Deploy',
            dependencies: ['unit-test', 'lint-test'],
            estimatedDurationMs: 30,
          },
        ],
      };

      const plan = service.getExecutionPlan(workflow);
      expect(plan.workflowId).toBe('diamond-wf');
      expect(plan.name).toBe('Diamond Workflow');
      expect(plan.totalTasks).toBe(4);
      expect(plan.waves).toHaveLength(3);

      expect(plan.waves[0]?.tasks.map((t) => t.id)).toEqual(['build']);
      expect(plan.waves[1]?.tasks.map((t) => t.id)).toEqual(['unit-test', 'lint-test']);
      expect(plan.waves[2]?.tasks.map((t) => t.id)).toEqual(['deploy']);

      expect(plan.maxConcurrency).toBe(2);
      expect(plan.criticalPath).toEqual(['build', 'lint-test', 'deploy']);
      expect(plan.totalEstimatedDurationMs).toBe(330); // 100 + 200 + 30
    });

    test('returns empty plan for empty workflow', () => {
      const workflow: WorkflowDefinition = {
        id: 'empty-wf',
        name: 'Empty Workflow',
        tasks: [],
      };

      const plan = service.getExecutionPlan(workflow);
      expect(plan.totalTasks).toBe(0);
      expect(plan.waves).toHaveLength(0);
      expect(plan.criticalPath).toEqual([]);
      expect(plan.totalEstimatedDurationMs).toBe(0);
      expect(plan.maxConcurrency).toBe(0);
    });
  });

  describe('predefined workflows', () => {
    test('returns standard predefined workflows', () => {
      const workflows = service.getPredefinedWorkflows();
      expect(workflows.length).toBeGreaterThanOrEqual(3);

      const ids = workflows.map((w) => w.id);
      expect(ids).toContain('mzsh-bootstrap');
      expect(ids).toContain('mzsh-audit-fix');
      expect(ids).toContain('mzsh-ci-pipeline');
    });

    test('mzsh-bootstrap workflow has valid graph structure and execution plan', () => {
      const bootstrap = service.getPredefinedWorkflow('mzsh-bootstrap');
      expect(bootstrap).toBeDefined();
      if (!bootstrap) return;

      const plan = service.getExecutionPlan(bootstrap);
      expect(plan.totalTasks).toBe(6);
      expect(plan.waves.length).toBeGreaterThanOrEqual(3);
      expect(plan.criticalPath.length).toBeGreaterThan(0);
      expect(plan.totalEstimatedDurationMs).toBeGreaterThan(0);
    });

    test('mzsh-audit-fix workflow has valid graph and plan', () => {
      const auditFix = service.getPredefinedWorkflow('mzsh-audit-fix');
      expect(auditFix).toBeDefined();
      if (!auditFix) return;

      const plan = service.getExecutionPlan(auditFix);
      expect(plan.totalTasks).toBe(6);
      expect(plan.maxConcurrency).toBeGreaterThanOrEqual(2);
    });

    test('mzsh-ci-pipeline workflow has valid graph and plan', () => {
      const ci = service.getPredefinedWorkflow('mzsh-ci-pipeline');
      expect(ci).toBeDefined();
      if (!ci) return;

      const plan = service.getExecutionPlan(ci);
      expect(plan.totalTasks).toBe(5);
      expect(plan.criticalPath).toContain('integration-tests');
    });

    test('returns undefined for non-existent predefined workflow', () => {
      expect(service.getPredefinedWorkflow('non-existent-wf')).toBeUndefined();
    });
  });

  describe('projectState', () => {
    test('projects task statuses and cascades blocked status to dependent tasks', () => {
      const workflow: WorkflowDefinition = {
        id: 'cascade-wf',
        name: 'Cascade Workflow',
        tasks: [
          { id: 'step1', name: 'Step 1', dependencies: [] },
          { id: 'step2', name: 'Step 2', dependencies: ['step1'] },
          { id: 'step3', name: 'Step 3', dependencies: ['step2'] },
        ],
      };

      const projected = service.projectState(workflow, {
        step1: 'failed',
      });

      expect(projected.getNode('step1')?.status).toBe('failed');
      expect(projected.getNode('step2')?.status).toBe('blocked');
      expect(projected.getNode('step3')?.status).toBe('blocked');
    });

    test('reflects completed and running statuses accurately', () => {
      const workflow: WorkflowDefinition = {
        id: 'parallel-wf',
        name: 'Parallel Workflow',
        tasks: [
          { id: 'root', name: 'Root', dependencies: [] },
          { id: 'branchA', name: 'Branch A', dependencies: ['root'] },
          { id: 'branchB', name: 'Branch B', dependencies: ['root'] },
        ],
      };

      const projected = service.projectState(workflow, {
        root: 'completed',
        branchA: 'running',
        branchB: 'pending',
      });

      expect(projected.getNode('root')?.status).toBe('completed');
      expect(projected.getNode('branchA')?.status).toBe('running');
      expect(projected.getNode('branchB')?.status).toBe('pending');
    });
  });
});
