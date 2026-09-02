/**
 * Core DAG (Directed Acyclic Graph) Domain Types
 */

export type DagNodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked';

export type DagNodeId = string;

export interface DagNode {
  readonly id: DagNodeId;
  readonly name: string;
  readonly summary?: string;
  readonly status: DagNodeStatus;
  readonly durationMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface DagEdge {
  readonly from: DagNodeId;
  readonly to: DagNodeId;
  readonly label?: string;
}

export interface DagCriticalPathResult {
  readonly path: readonly DagNodeId[];
  readonly totalDurationMs: number;
}

export interface DagLevel {
  readonly levelIndex: number;
  readonly nodeIds: readonly DagNodeId[];
}

export interface DagRenderOptions {
  readonly format?: 'box' | 'tree' | 'compact';
  readonly unicode?: boolean;
  readonly showStatus?: boolean;
  readonly showDuration?: boolean;
  readonly highlightCriticalPath?: boolean;
}

export type TopologicalSortResult =
  | { readonly success: true; readonly order: readonly DagNodeId[] }
  | { readonly success: false; readonly cycle: readonly DagNodeId[] };

export type CycleDetectionResult = {
  readonly hasCycle: boolean;
  readonly cyclePath?: readonly DagNodeId[];
};

export type ExecutedNodeStatus = 'completed' | 'failed' | 'running';

export const DAG_STATUS_MARKERS: Readonly<Record<DagNodeStatus, string>> = {
  pending: '[○]',
  running: '[▶]',
  completed: '[✔]',
  failed: '[✖]',
  blocked: '[⊘]',
};

export const DAG_STATUS_MARKERS_ASCII: Readonly<Record<DagNodeStatus, string>> = {
  pending: '[ ]',
  running: '[>]',
  completed: '[+]',
  failed: '[!]',
  blocked: '[-]',
};

export function getDagStatusMarker(status: DagNodeStatus, unicode = true): string {
  return unicode ? DAG_STATUS_MARKERS[status] : DAG_STATUS_MARKERS_ASCII[status];
}
