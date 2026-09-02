import type {
  ExecutionPlan,
  TaskDescriptor,
  WorkflowDefinition,
} from '../../application/dag/dag-service';
import type { DagGraph } from '../../domain/dag/dag-graph';
import type { DagNodeStatus } from '../../domain/dag/dag-types';

export interface DagViewProps {
  readonly workflow: WorkflowDefinition;
  readonly graph: DagGraph;
  readonly executionPlan?: ExecutionPlan;
  readonly selectedTaskId: string;
  readonly onSelectTask?: (id: string) => void;
  readonly highlightCriticalPath?: boolean;
  readonly filterStatus?: DagNodeStatus | 'all';
  readonly isCompact?: boolean;
}

interface StatusBadge {
  readonly label: string;
  readonly color: string;
  readonly glyph: string;
}

function getStatusBadge(status: DagNodeStatus): StatusBadge {
  switch (status) {
    case 'completed':
      return { label: '[✔] COMPLETED', color: '#a3be8c', glyph: '✔' };
    case 'running':
      return { label: '[▶] RUNNING', color: '#ebcb8b', glyph: '▶' };
    case 'failed':
      return { label: '[✖] FAILED', color: '#bf616a', glyph: '✖' };
    case 'blocked':
      return { label: '[⊘] BLOCKED', color: '#d08770', glyph: '⊘' };
    case 'pending':
      return { label: '[○] PENDING', color: '#81a1c1', glyph: '○' };
  }
}

function getDetailedStatusMessage(status: DagNodeStatus): string {
  switch (status) {
    case 'completed':
      return 'Task executed successfully with zero exit errors.';
    case 'running':
      return 'Task is currently executing parallel instructions.';
    case 'failed':
      return 'Task execution encountered an unhandled error or non-zero exit.';
    case 'blocked':
      return 'Task is blocked due to failure or block in upstream dependency.';
    case 'pending':
      return 'Task is queued awaiting upstream completion.';
  }
}

export function DagView({
  workflow,
  graph,
  executionPlan,
  selectedTaskId,
  highlightCriticalPath = true,
  filterStatus = 'all',
  isCompact = false,
}: DagViewProps): React.ReactNode {
  const criticalPath =
    executionPlan?.criticalPath ?? (highlightCriticalPath ? graph.computeCriticalPath().path : []);
  const criticalPathSet = new Set<string>(criticalPath);

  const taskMap = new Map<string, TaskDescriptor>(workflow.tasks.map((t) => [t.id, t]));

  const waves =
    executionPlan?.waves ??
    graph.computeLevels().map((lvl) => ({
      waveIndex: lvl.levelIndex,
      tasks: lvl.nodeIds
        .map((id) => taskMap.get(id))
        .filter((t): t is TaskDescriptor => t !== undefined),
    }));

  const effectiveSelectedTaskId =
    workflow.tasks.find((t) => t.id === selectedTaskId)?.id ?? workflow.tasks[0]?.id ?? '';

  const selectedTask = taskMap.get(effectiveSelectedTaskId);
  const selectedNode = graph.getNode(effectiveSelectedTaskId);
  const selectedStatus: DagNodeStatus = selectedNode?.status ?? 'pending';
  const selectedBadge = getStatusBadge(selectedStatus);

  const upstreamIds = graph.getUpstream(effectiveSelectedTaskId);
  const downstreamIds = graph.getDownstream(effectiveSelectedTaskId);

  const waveDirection = isCompact ? ('column' as const) : ('row' as const);

  return (
    <box style={{ flexDirection: 'column', gap: 1, width: '100%' }}>
      {/* Topological Waves Execution Grid */}
      <box
        borderStyle="rounded"
        borderColor="#434c5e"
        title={` Topological Waves Execution Grid (${waves.length} waves) `}
        titleColor="#88c0d0"
        style={{
          flexDirection: waveDirection,
          padding: 1,
          gap: 1,
          width: '100%',
          flexWrap: isCompact ? 'no-wrap' : 'wrap',
        }}
      >
        {waves.map((wave, waveIdx) => {
          const visibleTasks = wave.tasks.filter((task) => {
            if (filterStatus === 'all') return true;
            const node = graph.getNode(task.id);
            return (node?.status ?? 'pending') === filterStatus;
          });

          return (
            <box
              key={`wave-${wave.waveIndex}`}
              style={{
                flexDirection: isCompact ? 'column' : 'row',
                alignItems: isCompact ? 'stretch' : 'center',
                gap: 1,
              }}
            >
              <box
                borderStyle="single"
                borderColor="#3b4252"
                title={` Wave ${wave.waveIndex + 1} `}
                titleColor="#81a1c1"
                style={{
                  flexDirection: 'column',
                  paddingLeft: 1,
                  paddingRight: 1,
                  gap: 1,
                  minWidth: isCompact ? undefined : 24,
                }}
              >
                {visibleTasks.length === 0 ? (
                  <text fg="#616e88">No matching tasks</text>
                ) : (
                  visibleTasks.map((task) => {
                    const isSelected = task.id === effectiveSelectedTaskId;
                    const isCritical = criticalPathSet.has(task.id);
                    const node = graph.getNode(task.id);
                    const status: DagNodeStatus = node?.status ?? 'pending';
                    const badge = getStatusBadge(status);
                    const duration = task.estimatedDurationMs ?? node?.durationMs ?? 0;

                    return (
                      <box
                        key={task.id}
                        borderStyle="rounded"
                        borderColor={isSelected ? '#88c0d0' : '#434c5e'}
                        style={{
                          flexDirection: 'column',
                          paddingLeft: 1,
                          paddingRight: 1,
                          paddingTop: 0,
                          paddingBottom: 0,
                          gap: 0,
                        }}
                      >
                        <box style={{ flexDirection: 'row', gap: 1, flexWrap: 'wrap' }}>
                          <text fg={isSelected ? '#88c0d0' : '#616e88'}>
                            {isSelected ? '▶' : ' '}
                          </text>
                          <text fg={isSelected ? '#88c0d0' : '#eceff4'}>{task.name}</text>
                        </box>

                        <box style={{ flexDirection: 'row', gap: 1, flexWrap: 'wrap' }}>
                          <text fg="#81a1c1">{`(${task.id})`}</text>
                          <text fg="#616e88">{`${duration}ms`}</text>
                        </box>

                        <box
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            gap: 1,
                            flexWrap: 'wrap',
                          }}
                        >
                          <text fg={badge.color}>{badge.label}</text>
                          {highlightCriticalPath && isCritical ? (
                            <text fg="#ebcb8b">★ CRITICAL</text>
                          ) : null}
                        </box>
                      </box>
                    );
                  })
                )}
              </box>

              {waveIdx < waves.length - 1 ? (
                <box
                  style={{
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: isCompact ? 0 : 1,
                  }}
                >
                  <text fg="#616e88">{isCompact ? '▼' : '──▶'}</text>
                </box>
              ) : null}
            </box>
          );
        })}
      </box>

      {/* Node Details / Inspection Panel */}
      {selectedTask !== undefined ? (
        <box
          borderStyle="rounded"
          borderColor="#88c0d0"
          title={` Task Details: ${selectedTask.name} `}
          titleColor="#88c0d0"
          style={{ flexDirection: 'column', padding: 1, gap: 0, width: '100%' }}
        >
          <box style={{ flexDirection: 'row', gap: 2, flexWrap: 'wrap' }}>
            <text fg="#81a1c1">Task Name &amp; ID:</text>
            <text fg="#eceff4">{selectedTask.name}</text>
            <text fg="#88c0d0">{`[${selectedTask.id}]`}</text>
            {highlightCriticalPath && criticalPathSet.has(selectedTask.id) ? (
              <text fg="#ebcb8b">[★ Critical Path Node]</text>
            ) : null}
          </box>

          <box style={{ flexDirection: 'row', gap: 2, marginTop: 1, flexWrap: 'wrap' }}>
            <text fg="#81a1c1">Summary &amp; Description:</text>
            <text fg="#d8dee9">
              {selectedTask.description ?? selectedNode?.summary ?? 'No description provided'}
            </text>
          </box>

          <box style={{ flexDirection: 'row', gap: 2, marginTop: 1, flexWrap: 'wrap' }}>
            <text fg="#81a1c1">Status:</text>
            <text fg={selectedBadge.color}>{selectedBadge.label}</text>
            <text fg="#d8dee9">{`— ${getDetailedStatusMessage(selectedStatus)}`}</text>
          </box>

          <box style={{ flexDirection: 'column', gap: 0, marginTop: 1 }}>
            <text fg="#81a1c1">{`Upstream Dependencies (${upstreamIds.length}):`}</text>
            {upstreamIds.length === 0 ? (
              <text fg="#616e88"> None (Root task — execution ready at Wave 1)</text>
            ) : (
              <box style={{ flexDirection: 'row', gap: 2, flexWrap: 'wrap', paddingLeft: 1 }}>
                {upstreamIds.map((depId) => {
                  const depNode = graph.getNode(depId);
                  const depStatus: DagNodeStatus = depNode?.status ?? 'pending';
                  const depBadge = getStatusBadge(depStatus);
                  return (
                    <box key={depId} style={{ flexDirection: 'row', gap: 1 }}>
                      <text fg={depBadge.color}>{depBadge.glyph}</text>
                      <text fg="#eceff4">{depId}</text>
                      <text fg={depBadge.color}>{`(${depStatus})`}</text>
                    </box>
                  );
                })}
              </box>
            )}
          </box>

          <box style={{ flexDirection: 'column', gap: 0, marginTop: 1 }}>
            <text fg="#81a1c1">{`Downstream Dependents (${downstreamIds.length}):`}</text>
            {downstreamIds.length === 0 ? (
              <text fg="#616e88"> None (Leaf task — terminal workflow node)</text>
            ) : (
              <box style={{ flexDirection: 'row', gap: 2, flexWrap: 'wrap', paddingLeft: 1 }}>
                {downstreamIds.map((childId) => {
                  const childNode = graph.getNode(childId);
                  const childStatus: DagNodeStatus = childNode?.status ?? 'pending';
                  const childBadge = getStatusBadge(childStatus);
                  return (
                    <box key={childId} style={{ flexDirection: 'row', gap: 1 }}>
                      <text fg={childBadge.color}>{childBadge.glyph}</text>
                      <text fg="#eceff4">{childId}</text>
                      <text fg={childBadge.color}>{`(${childStatus})`}</text>
                    </box>
                  );
                })}
              </box>
            )}
          </box>

          <box style={{ flexDirection: 'row', gap: 2, marginTop: 1, flexWrap: 'wrap' }}>
            <text fg="#81a1c1">Estimated Duration:</text>
            <text fg="#eceff4">
              {`${selectedTask.estimatedDurationMs ?? selectedNode?.durationMs ?? 0}ms`}
            </text>
            {selectedTask.command !== undefined ? (
              <>
                <text fg="#81a1c1">Command:</text>
                <text fg="#88c0d0">{selectedTask.command}</text>
              </>
            ) : null}
            {selectedTask.tags !== undefined && selectedTask.tags.length > 0 ? (
              <>
                <text fg="#81a1c1">Tags:</text>
                <text fg="#ebcb8b">{selectedTask.tags.join(', ')}</text>
              </>
            ) : null}
          </box>
        </box>
      ) : null}
    </box>
  );
}
