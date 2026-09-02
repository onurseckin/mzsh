import * as React from 'react';
import { useMemo, useState } from 'react';
import { useBindings } from '@opentui/keymap/react';
import { DagWorkflowService, PREDEFINED_WORKFLOWS } from '../../application/dag/dag-service';
import type { DagNodeStatus } from '../../domain/dag/dag-types';
import { DagView } from '../components/dag-view';
import type { TuiViewModel } from '../types';

export interface DagScreenProps {
  readonly viewModel: TuiViewModel;
  readonly workflowIndex?: number;
  readonly selectedTaskId?: string;
  readonly highlightCriticalPath?: boolean;
  readonly filterStatus?: DagNodeStatus | 'all';
  readonly simStep?: number;
}

const FILTER_OPTIONS: readonly (DagNodeStatus | 'all')[] = [
  'all',
  'pending',
  'running',
  'completed',
  'failed',
  'blocked',
] as const;

function getNextFilter(current: DagNodeStatus | 'all'): DagNodeStatus | 'all' {
  const currentIndex = FILTER_OPTIONS.indexOf(current);
  const nextIndex = (currentIndex + 1) % FILTER_OPTIONS.length;
  return FILTER_OPTIONS[nextIndex] ?? 'all';
}

interface ReactInternals {
  readonly __CLIENT_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?: {
    readonly H?: unknown;
  };
  readonly __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?: {
    readonly ReactCurrentDispatcher?: {
      readonly current?: unknown;
    };
  };
}

function isReactDispatcherActive(): boolean {
  const internals = React as unknown as ReactInternals;
  return Boolean(
    internals.__CLIENT_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?.H ??
    internals.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?.ReactCurrentDispatcher?.current
  );
}

function useSafeState<T>(initialValue: T): [T, (val: T | ((prev: T) => T)) => void] {
  if (!isReactDispatcherActive()) {
    return [initialValue, () => {}];
  }
  return useState<T>(initialValue);
}

function useSafeMemo<T>(factory: () => T, deps: readonly unknown[]): T {
  if (!isReactDispatcherActive()) {
    return factory();
  }
  return useMemo(factory, deps);
}

export function DagScreen(props: DagScreenProps): React.ReactNode {
  const { viewModel } = props;
  const dagService = useSafeMemo(() => new DagWorkflowService(), []);

  const [workflowIndexState, setWorkflowIndex] = useSafeState<number>(props.workflowIndex ?? 0);
  const workflowIndex = props.workflowIndex ?? workflowIndexState;

  const [selectedTaskIdState, setSelectedTaskId] = useSafeState<string>(
    props.selectedTaskId ?? 'validate-env'
  );
  const rawSelectedTaskId = props.selectedTaskId ?? selectedTaskIdState;

  const [highlightCriticalPathState, setHighlightCriticalPath] = useSafeState<boolean>(
    props.highlightCriticalPath ?? true
  );
  const highlightCriticalPath = props.highlightCriticalPath ?? highlightCriticalPathState;

  const [filterStatusState, setFilterStatus] = useSafeState<DagNodeStatus | 'all'>(
    props.filterStatus ?? 'all'
  );
  const filterStatus = props.filterStatus ?? filterStatusState;

  const [simStepState, setSimStep] = useSafeState<number>(props.simStep ?? 0);
  const simStep = props.simStep ?? simStepState;

  const currentWorkflow =
    PREDEFINED_WORKFLOWS[workflowIndex % PREDEFINED_WORKFLOWS.length] ?? PREDEFINED_WORKFLOWS[0]!;

  const executionPlan = useSafeMemo(
    () => dagService.getExecutionPlan(currentWorkflow),
    [dagService, currentWorkflow]
  );

  const baseGraph = useSafeMemo(
    () => dagService.createGraph(currentWorkflow),
    [dagService, currentWorkflow]
  );

  const totalSimSteps = executionPlan.waves.length + 1;

  const graph = useSafeMemo(() => {
    if (simStep === 0) return baseGraph;

    const taskStatuses: Record<string, 'pending' | 'running' | 'completed'> = {};
    for (let w = 0; w < executionPlan.waves.length; w += 1) {
      const wave = executionPlan.waves[w]!;
      for (const t of wave.tasks) {
        if (w < simStep - 1) {
          taskStatuses[t.id] = 'completed';
        } else if (w === simStep - 1) {
          taskStatuses[t.id] = 'running';
        } else {
          taskStatuses[t.id] = 'pending';
        }
      }
    }

    if (simStep >= totalSimSteps) {
      for (const t of currentWorkflow.tasks) {
        taskStatuses[t.id] = 'completed';
      }
    }

    return dagService.projectState(currentWorkflow, taskStatuses);
  }, [dagService, currentWorkflow, executionPlan, baseGraph, simStep, totalSimSteps]);

  const allTaskIds = useSafeMemo(() => currentWorkflow.tasks.map((t) => t.id), [currentWorkflow]);

  const effectiveSelectedTaskId = allTaskIds.includes(rawSelectedTaskId)
    ? rawSelectedTaskId
    : (allTaskIds[0] ?? '');

  const nodes = graph.getNodes();
  const completedCount = nodes.filter((n) => n.status === 'completed').length;
  const runningCount = nodes.filter((n) => n.status === 'running').length;
  const pendingCount = nodes.filter((n) => n.status === 'pending').length;
  const failedCount = nodes.filter((n) => n.status === 'failed').length;
  const blockedCount = nodes.filter((n) => n.status === 'blocked').length;

  const handleNextTask = () => {
    if (allTaskIds.length === 0) return;
    const currentIndex = allTaskIds.indexOf(effectiveSelectedTaskId);
    const nextIndex = (currentIndex + 1) % allTaskIds.length;
    setSelectedTaskId(allTaskIds[nextIndex] ?? allTaskIds[0]!);
  };

  const handlePrevTask = () => {
    if (allTaskIds.length === 0) return;
    const currentIndex = allTaskIds.indexOf(effectiveSelectedTaskId);
    const prevIndex = (currentIndex - 1 + allTaskIds.length) % allTaskIds.length;
    setSelectedTaskId(allTaskIds[prevIndex] ?? allTaskIds[0]!);
  };

  const handleCycleWorkflow = () => {
    const nextWfIndex = (workflowIndex + 1) % PREDEFINED_WORKFLOWS.length;
    const nextWf = PREDEFINED_WORKFLOWS[nextWfIndex]!;
    setWorkflowIndex(nextWfIndex);
    setSelectedTaskId(nextWf.tasks[0]?.id ?? '');
    setSimStep(0);
  };

  const handleStepSim = () => {
    setSimStep((prev) => (prev >= totalSimSteps ? 0 : prev + 1));
  };

  if (isReactDispatcherActive()) {
    useBindings(
      () => ({
        commands: [
          {
            name: 'dag.cycle-workflow',
            run: handleCycleWorkflow,
          },
          {
            name: 'dag.toggle-critical',
            run: () => setHighlightCriticalPath((prev) => !prev),
          },
          {
            name: 'dag.cycle-filter',
            run: () => setFilterStatus((curr) => getNextFilter(curr)),
          },
          {
            name: 'dag.step-sim',
            run: handleStepSim,
          },
          {
            name: 'dag.reset-sim',
            run: () => setSimStep(0),
          },
          {
            name: 'dag.next-task',
            run: handleNextTask,
          },
          {
            name: 'dag.prev-task',
            run: handlePrevTask,
          },
        ],
        bindings: [
          { key: 'w', cmd: 'dag.cycle-workflow' },
          { key: 'c', cmd: 'dag.toggle-critical' },
          { key: 'f', cmd: 'dag.cycle-filter' },
          { key: 's', cmd: 'dag.cycle-filter' },
          { key: 'r', cmd: 'dag.step-sim' },
          { key: 'space', cmd: 'dag.step-sim' },
          { key: 'x', cmd: 'dag.reset-sim' },
          { key: 'j', cmd: 'dag.next-task' },
          { key: 'down', cmd: 'dag.next-task' },
          { key: 'n', cmd: 'dag.next-task' },
          { key: 'k', cmd: 'dag.prev-task' },
          { key: 'up', cmd: 'dag.prev-task' },
          { key: 'p', cmd: 'dag.prev-task' },
        ],
      }),
      [
        workflowIndex,
        effectiveSelectedTaskId,
        allTaskIds,
        totalSimSteps,
        highlightCriticalPath,
        filterStatus,
        simStep,
      ]
    );
  }

  return (
    <box style={{ flexDirection: 'column', gap: 1, width: '100%' }}>
      {/* Header / Summary Metrics Bar */}
      <box
        borderStyle="rounded"
        borderColor="#434c5e"
        title={` Workflow DAG Execution Plan • ${currentWorkflow.name} `}
        titleColor="#88c0d0"
        style={{ flexDirection: 'column', padding: 1, gap: 0 }}
      >
        <box
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <box style={{ flexDirection: 'row', gap: 2, flexWrap: 'wrap' }}>
            <text fg="#81a1c1">Active Workflow:</text>
            <text fg="#eceff4">{currentWorkflow.name}</text>
            <text fg="#88c0d0">{`(${currentWorkflow.id})`}</text>
          </box>
          <text fg="#616e88">[Press 'w' to cycle workflow]</text>
        </box>

        <box style={{ flexDirection: 'row', gap: 3, marginTop: 1, flexWrap: 'wrap' }}>
          <box style={{ flexDirection: 'row', gap: 1 }}>
            <text fg="#81a1c1">Total Tasks:</text>
            <text fg="#eceff4">{executionPlan.totalTasks}</text>
          </box>
          <box style={{ flexDirection: 'row', gap: 1 }}>
            <text fg="#81a1c1">Execution Waves:</text>
            <text fg="#eceff4">{executionPlan.waves.length}</text>
          </box>
          <box style={{ flexDirection: 'row', gap: 1 }}>
            <text fg="#81a1c1">Max Concurrency:</text>
            <text fg="#eceff4">{executionPlan.maxConcurrency}</text>
          </box>
          <box style={{ flexDirection: 'row', gap: 1 }}>
            <text fg="#81a1c1">Critical Path:</text>
            <text fg="#ebcb8b">{`${executionPlan.criticalPath.length} tasks (${executionPlan.totalEstimatedDurationMs}ms)`}</text>
          </box>
        </box>

        {/* Status Badges Summary Count */}
        <box style={{ flexDirection: 'row', gap: 2, marginTop: 1, flexWrap: 'wrap' }}>
          <text fg="#a3be8c">{`✔ ${completedCount} Completed`}</text>
          <text fg="#ebcb8b">{`▶ ${runningCount} Running`}</text>
          <text fg="#81a1c1">{`○ ${pendingCount} Pending`}</text>
          {failedCount > 0 ? <text fg="#bf616a">{`✖ ${failedCount} Failed`}</text> : null}
          {blockedCount > 0 ? <text fg="#d08770">{`⊘ ${blockedCount} Blocked`}</text> : null}
          <text fg="#616e88">{`• Simulation: ${simStep === 0 ? 'Idle (all pending)' : simStep >= totalSimSteps ? 'Complete' : `Wave ${simStep}/${executionPlan.waves.length}`}`}</text>
        </box>
      </box>

      {/* DAG Visualizer Component */}
      <DagView
        workflow={currentWorkflow}
        graph={graph}
        executionPlan={executionPlan}
        selectedTaskId={effectiveSelectedTaskId}
        onSelectTask={setSelectedTaskId}
        highlightCriticalPath={highlightCriticalPath}
        filterStatus={filterStatus}
        isCompact={viewModel.viewport.isCompact}
      />

      {/* DAG Controls Help Bar */}
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1,
          marginTop: 0,
        }}
      >
        <text fg="#81a1c1">
          {`[w] workflow (${workflowIndex + 1}/${PREDEFINED_WORKFLOWS.length})  •  [c] crit path (${highlightCriticalPath ? 'ON' : 'OFF'})  •  [f/s] filter (${filterStatus})  •  [r/space] sim step  •  [j/k] select task`}
        </text>
        <text fg="#616e88">x reset sim • ? full help</text>
      </box>
    </box>
  );
}
