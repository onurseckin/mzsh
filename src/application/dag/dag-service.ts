import { DagGraph } from '../../domain/dag/dag-graph';

export interface TaskDescriptor {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly dependencies: readonly string[];
  readonly estimatedDurationMs?: number;
  readonly command?: string;
  readonly tags?: readonly string[];
}

export interface WorkflowDefinition {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly tasks: readonly TaskDescriptor[];
}

export interface ExecutionWave {
  readonly waveIndex: number;
  readonly tasks: readonly TaskDescriptor[];
}

export interface ExecutionPlan {
  readonly workflowId: string;
  readonly name: string;
  readonly waves: readonly ExecutionWave[];
  readonly criticalPath: readonly string[];
  readonly totalEstimatedDurationMs: number;
  readonly maxConcurrency: number;
  readonly totalTasks: number;
}

export const PREDEFINED_WORKFLOWS: readonly WorkflowDefinition[] = [
  {
    id: 'mzsh-bootstrap',
    name: 'MZSH Bootstrap',
    description: 'End-to-end bootstrap workflow initializing mzsh environment',
    tasks: [
      {
        id: 'validate-env',
        name: 'Validate Environment',
        description: 'Probe environment preconditions and dependencies',
        dependencies: [],
        estimatedDurationMs: 120,
        command: 'bun run mzsh -- audit',
        tags: ['audit', 'preflight'],
      },
      {
        id: 'backup-legacy',
        name: 'Backup Legacy Configs',
        description: 'Archive existing zsh files before modification',
        dependencies: ['validate-env'],
        estimatedDurationMs: 80,
        tags: ['backup', 'safety'],
      },
      {
        id: 'install-modules',
        name: 'Install Shell Modules',
        description: 'Download and compile core shell module packages',
        dependencies: ['validate-env'],
        estimatedDurationMs: 300,
        tags: ['install', 'modules'],
      },
      {
        id: 'compile-loader',
        name: 'Compile Loader Scripts',
        description: 'Generate optimized entrypoint loader and compiled scripts',
        dependencies: ['install-modules'],
        estimatedDurationMs: 150,
        tags: ['compile', 'loader'],
      },
      {
        id: 'link-shims',
        name: 'Link Binary Shims',
        description: 'Create symlinks for managed command shims in bin directory',
        dependencies: ['validate-env'],
        estimatedDurationMs: 100,
        tags: ['shims', 'links'],
      },
      {
        id: 'verify-setup',
        name: 'Verify Installation',
        description: 'Execute post-adoption health and syntax verification',
        dependencies: ['backup-legacy', 'compile-loader', 'link-shims'],
        estimatedDurationMs: 90,
        command: 'bun run mzsh -- audit',
        tags: ['verify', 'postflight'],
      },
    ],
  },
  {
    id: 'mzsh-audit-fix',
    name: 'MZSH Audit & Auto-Fix',
    description: 'Audit shell health and apply automatic drift remediations',
    tasks: [
      {
        id: 'probe-health',
        name: 'Probe System Health',
        description: 'Inspect system files, permissions, and toolchains',
        dependencies: [],
        estimatedDurationMs: 100,
        tags: ['probe', 'audit'],
      },
      {
        id: 'detect-drift',
        name: 'Detect Configuration Drift',
        description: 'Compare active configuration against managed repository state',
        dependencies: ['probe-health'],
        estimatedDurationMs: 150,
        tags: ['drift', 'audit'],
      },
      {
        id: 'heal-permissions',
        name: 'Repair File Permissions',
        description: 'Restore secure file and directory mode permissions',
        dependencies: ['detect-drift'],
        estimatedDurationMs: 200,
        tags: ['permissions', 'fix'],
      },
      {
        id: 'resync-plugins',
        name: 'Resynchronize Plugins',
        description: 'Update and sync managed plugins to desired versions',
        dependencies: ['detect-drift'],
        estimatedDurationMs: 400,
        tags: ['plugins', 'fix'],
      },
      {
        id: 'rebuild-cache',
        name: 'Rebuild Environment Cache',
        description: 'Clear and regenerate environment cache index',
        dependencies: ['heal-permissions', 'resync-plugins'],
        estimatedDurationMs: 120,
        tags: ['cache', 'fix'],
      },
      {
        id: 'post-audit',
        name: 'Post-Execution Audit Verification',
        description: 'Verify drift remediation succeeded with zero errors',
        dependencies: ['rebuild-cache'],
        estimatedDurationMs: 80,
        tags: ['verify', 'audit'],
      },
    ],
  },
  {
    id: 'mzsh-ci-pipeline',
    name: 'MZSH CI Pipeline',
    description: 'Continuous integration linting, type-checking, and test suite',
    tasks: [
      {
        id: 'lint',
        name: 'ESLint & Formatting',
        description: 'Run linter and code style formatting verification',
        dependencies: [],
        estimatedDurationMs: 250,
        command: 'bun run lint',
        tags: ['lint', 'ci'],
      },
      {
        id: 'typecheck',
        name: 'TypeScript Typecheck',
        description: 'Verify static types with strict compiler settings',
        dependencies: [],
        estimatedDurationMs: 450,
        command: 'bun run build:ts',
        tags: ['types', 'ci'],
      },
      {
        id: 'unit-tests',
        name: 'Unit Tests',
        description: 'Execute isolated unit test suites',
        dependencies: ['lint', 'typecheck'],
        estimatedDurationMs: 600,
        command: 'bun run test:unit',
        tags: ['test', 'unit'],
      },
      {
        id: 'integration-tests',
        name: 'Integration Tests',
        description: 'Execute end-to-end and integration CLI test suites',
        dependencies: ['lint', 'typecheck'],
        estimatedDurationMs: 900,
        command: 'bun run test:integration',
        tags: ['test', 'integration'],
      },
      {
        id: 'package-check',
        name: 'Package Validation',
        description: 'Validate distribution bundle compilation and packaging',
        dependencies: ['unit-tests', 'integration-tests'],
        estimatedDurationMs: 350,
        command: 'bun run build',
        tags: ['build', 'package'],
      },
    ],
  },
];

export class DagWorkflowService {
  public createGraph(workflow: WorkflowDefinition): DagGraph {
    const taskMap = new Map<string, TaskDescriptor>();
    for (const task of workflow.tasks) {
      if (taskMap.has(task.id)) {
        throw new Error(`Duplicate task ID "${task.id}" in workflow "${workflow.id}"`);
      }
      taskMap.set(task.id, task);
    }

    for (const task of workflow.tasks) {
      for (const dep of task.dependencies) {
        if (!taskMap.has(dep)) {
          throw new Error(
            `Task "${task.id}" depends on unknown task "${dep}" in workflow "${workflow.id}"`
          );
        }
      }
    }

    const graph = new DagGraph();
    for (const task of workflow.tasks) {
      graph.addNode({
        id: task.id,
        name: task.name,
        ...(task.description !== undefined ? { summary: task.description } : {}),
        status: 'pending',
        ...(task.estimatedDurationMs !== undefined ? { durationMs: task.estimatedDurationMs } : {}),
        metadata: {
          ...(task.command !== undefined ? { command: task.command } : {}),
          ...(task.tags !== undefined ? { tags: task.tags } : {}),
          ...(task.description !== undefined ? { description: task.description } : {}),
        },
      });
    }

    for (const task of workflow.tasks) {
      for (const dep of task.dependencies) {
        graph.addEdge(dep, task.id);
      }
    }

    const cycle = graph.detectCycles();
    if (cycle.hasCycle) {
      throw new Error(
        `Workflow "${workflow.id}" contains a cycle: ${(cycle.cyclePath ?? []).join(' -> ')}`
      );
    }

    return graph;
  }

  public getExecutionPlan(workflow: WorkflowDefinition): ExecutionPlan {
    const graph = this.createGraph(workflow);
    if (workflow.tasks.length === 0) {
      return {
        workflowId: workflow.id,
        name: workflow.name,
        waves: [],
        criticalPath: [],
        totalEstimatedDurationMs: 0,
        maxConcurrency: 0,
        totalTasks: 0,
      };
    }

    const taskMap = new Map<string, TaskDescriptor>(workflow.tasks.map((t) => [t.id, t]));
    const levels = graph.computeLevels();
    const waves = levels.map((lvl) => ({
      waveIndex: lvl.levelIndex,
      tasks: lvl.nodeIds.map((id) => {
        const task = taskMap.get(id);
        if (task === undefined) {
          throw new Error(`Task with id "${id}" not found`);
        }
        return task;
      }),
    }));

    const crit = graph.computeCriticalPath();
    const maxConcurrency =
      waves.length > 0 ? Math.max(...waves.map((wave) => wave.tasks.length)) : 0;

    return {
      workflowId: workflow.id,
      name: workflow.name,
      waves,
      criticalPath: crit.path,
      totalEstimatedDurationMs: crit.totalDurationMs,
      maxConcurrency,
      totalTasks: workflow.tasks.length,
    };
  }

  public getPredefinedWorkflows(): readonly WorkflowDefinition[] {
    return PREDEFINED_WORKFLOWS;
  }

  public getPredefinedWorkflow(id: string): WorkflowDefinition | undefined {
    return PREDEFINED_WORKFLOWS.find((w) => w.id === id);
  }

  public projectState(
    workflow: WorkflowDefinition,
    taskStatuses: Record<string, 'completed' | 'failed' | 'running' | 'pending'>
  ): DagGraph {
    const graph = this.createGraph(workflow);
    return graph.projectStatuses(taskStatuses);
  }
}
