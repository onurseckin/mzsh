import { DagWorkflowService } from '../application/dag/dag-service';
import type { ManagedCommand } from '../catalog/types';
import { DagGraph } from '../domain/dag/dag-graph';
import { renderDag } from '../domain/dag/dag-renderer';
import type { RunMzshCliDependencies } from './run-cli';

export type DagCliArgs = Extract<ManagedCommand, { kind: 'dag' }>;

export function runDagCommand(parsed: DagCliArgs, dependencies: RunMzshCliDependencies): number {
  const service = new DagWorkflowService();
  const workflowId = parsed.workflow ?? 'mzsh-bootstrap';
  const workflow = service.getPredefinedWorkflow(workflowId);

  if (workflow === undefined) {
    dependencies.write(`MZSH_USAGE_unknown-workflow: ${workflowId}`);
    return 1;
  }

  if (parsed.simulate) {
    const plan = service.getExecutionPlan(workflow);
    if (parsed.json) {
      const simulation = {
        workflowId: workflow.id,
        name: workflow.name,
        totalTasks: plan.totalTasks,
        totalWaves: plan.waves.length,
        maxConcurrency: plan.maxConcurrency,
        totalEstimatedDurationMs: plan.totalEstimatedDurationMs,
        criticalPath: plan.criticalPath,
        waves: plan.waves.map((w) => ({
          waveIndex: w.waveIndex,
          tasks: w.tasks.map((t) => ({
            id: t.id,
            name: t.name,
            estimatedDurationMs: t.estimatedDurationMs,
            dependencies: t.dependencies,
          })),
        })),
      };
      dependencies.write(JSON.stringify(simulation));
      return 0;
    }

    const lines: string[] = [
      `Simulating workflow: ${workflow.name} (${workflow.id})`,
      `Total Tasks: ${plan.totalTasks} | Waves: ${plan.waves.length} | Max Concurrency: ${plan.maxConcurrency} | Estimated: ${plan.totalEstimatedDurationMs}ms`,
      `Critical Path: ${plan.criticalPath.join(' -> ')}`,
      '',
    ];

    for (const wave of plan.waves) {
      const taskNames = wave.tasks.map((t) => `${t.name} (${t.id})`).join(', ');
      lines.push(
        `Wave ${wave.waveIndex + 1}/${plan.waves.length} [${wave.tasks.length} tasks]: ${taskNames}`
      );
    }

    lines.push('');
    lines.push('Simulation completed successfully.');
    dependencies.write(lines.join('\n'));
    return 0;
  }

  if (parsed.json) {
    const plan = service.getExecutionPlan(workflow);
    dependencies.write(JSON.stringify(plan));
    return 0;
  }

  let graph = service.createGraph(workflow);

  if (parsed.filter !== undefined) {
    const filterStatus = parsed.filter;
    const filteredGraph = new DagGraph();
    const matchingNodes = graph.getNodes().filter((n) => n.status === filterStatus);
    for (const node of matchingNodes) {
      filteredGraph.addNode(node);
    }
    for (const edge of graph.getEdges()) {
      if (filteredGraph.getNode(edge.from) && filteredGraph.getNode(edge.to)) {
        filteredGraph.addEdge(edge.from, edge.to, edge.label);
      }
    }
    graph = filteredGraph;
  }

  const rendered = renderDag(graph, {
    format: parsed.format ?? 'box',
    highlightCriticalPath: parsed.criticalPath ?? false,
    unicode: true,
  });

  dependencies.write(rendered);
  return 0;
}
