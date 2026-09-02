import type {
  CycleDetectionResult,
  DagCriticalPathResult,
  DagEdge,
  DagLevel,
  DagNode,
  DagNodeId,
  DagNodeStatus,
  ExecutedNodeStatus,
  TopologicalSortResult,
} from './dag-types';

export class DagGraph {
  private readonly nodes: Map<DagNodeId, DagNode> = new Map();
  private readonly outgoing: Map<DagNodeId, Set<DagNodeId>> = new Map();
  private readonly incoming: Map<DagNodeId, Set<DagNodeId>> = new Map();
  private readonly edgeLabels: Map<string, string> = new Map();

  public static create(): DagGraph {
    return new DagGraph();
  }

  public static fromNodesAndEdges(
    nodes: readonly DagNode[],
    edges: readonly DagEdge[] = []
  ): DagGraph {
    const graph = new DagGraph();
    for (const node of nodes) {
      graph.addNode(node);
    }
    for (const edge of edges) {
      graph.addEdge(edge.from, edge.to, edge.label);
    }
    return graph;
  }

  public addNode(node: DagNode): this {
    this.nodes.set(node.id, { ...node });
    if (!this.outgoing.has(node.id)) {
      this.outgoing.set(node.id, new Set());
    }
    if (!this.incoming.has(node.id)) {
      this.incoming.set(node.id, new Set());
    }
    return this;
  }

  public addEdge(from: DagNodeId, to: DagNodeId, label?: string): this {
    if (!this.nodes.has(from)) {
      this.addNode({ id: from, name: from, status: 'pending' });
    }
    if (!this.nodes.has(to)) {
      this.addNode({ id: to, name: to, status: 'pending' });
    }

    this.outgoing.get(from)!.add(to);
    this.incoming.get(to)!.add(from);

    if (label !== undefined) {
      this.edgeLabels.set(`${from}->${to}`, label);
    }
    return this;
  }

  public getNode(id: DagNodeId): DagNode | undefined {
    return this.nodes.get(id);
  }

  public getNodes(): readonly DagNode[] {
    return Array.from(this.nodes.values());
  }

  public getEdges(): readonly DagEdge[] {
    const edges: DagEdge[] = [];
    for (const [from, toSet] of this.outgoing.entries()) {
      for (const to of toSet) {
        const label = this.edgeLabels.get(`${from}->${to}`);
        edges.push(label !== undefined ? { from, to, label } : { from, to });
      }
    }
    return edges;
  }

  public getUpstream(id: DagNodeId): readonly DagNodeId[] {
    const set = this.incoming.get(id);
    return set ? Array.from(set) : [];
  }

  public getDownstream(id: DagNodeId): readonly DagNodeId[] {
    const set = this.outgoing.get(id);
    return set ? Array.from(set) : [];
  }

  public getTransitiveDependencies(id: DagNodeId): readonly DagNodeId[] {
    const visited = new Set<DagNodeId>();
    const queue: DagNodeId[] = [...this.getUpstream(id)];
    for (const item of queue) {
      visited.add(item);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const parent of this.getUpstream(current)) {
        if (!visited.has(parent)) {
          visited.add(parent);
          queue.push(parent);
        }
      }
    }
    return Array.from(visited);
  }

  public getTransitiveDependents(id: DagNodeId): readonly DagNodeId[] {
    const visited = new Set<DagNodeId>();
    const queue: DagNodeId[] = [...this.getDownstream(id)];
    for (const item of queue) {
      visited.add(item);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const child of this.getDownstream(current)) {
        if (!visited.has(child)) {
          visited.add(child);
          queue.push(child);
        }
      }
    }
    return Array.from(visited);
  }

  public detectCycles(): CycleDetectionResult {
    const state = new Map<DagNodeId, 'visiting' | 'visited'>();
    const stack: DagNodeId[] = [];

    const dfs = (current: DagNodeId): readonly DagNodeId[] | undefined => {
      state.set(current, 'visiting');
      stack.push(current);

      const neighbors = this.getDownstream(current);
      for (const neighbor of neighbors) {
        const neighborState = state.get(neighbor);
        if (neighborState === 'visiting') {
          const cycleStartIndex = stack.indexOf(neighbor);
          if (cycleStartIndex !== -1) {
            return [...stack.slice(cycleStartIndex), neighbor];
          }
          return [neighbor, current, neighbor];
        }
        if (neighborState === undefined) {
          const cycle = dfs(neighbor);
          if (cycle !== undefined) {
            return cycle;
          }
        }
      }

      stack.pop();
      state.set(current, 'visited');
      return undefined;
    };

    for (const nodeId of this.nodes.keys()) {
      if (state.get(nodeId) === undefined) {
        const cycle = dfs(nodeId);
        if (cycle !== undefined) {
          return { hasCycle: true, cyclePath: cycle };
        }
      }
    }

    return { hasCycle: false };
  }

  public topologicalSort(): TopologicalSortResult {
    const cycleCheck = this.detectCycles();
    if (cycleCheck.hasCycle) {
      return { success: false, cycle: cycleCheck.cyclePath ?? [] };
    }

    const inDegree = new Map<DagNodeId, number>();
    for (const nodeId of this.nodes.keys()) {
      inDegree.set(nodeId, this.getUpstream(nodeId).length);
    }

    const queue: DagNodeId[] = [];
    for (const [nodeId, deg] of inDegree.entries()) {
      if (deg === 0) {
        queue.push(nodeId);
      }
    }

    const order: DagNodeId[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);

      for (const neighbor of this.getDownstream(current)) {
        const nextDeg = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, nextDeg);
        if (nextDeg === 0) {
          queue.push(neighbor);
        }
      }
    }

    return { success: true, order };
  }

  public computeLevels(): readonly DagLevel[] {
    const sortResult = this.topologicalSort();
    if (!sortResult.success) {
      throw new Error('DAG contains cycles; cannot compute execution levels');
    }

    if (this.nodes.size === 0) {
      return [];
    }

    const levelMap = new Map<DagNodeId, number>();
    for (const nodeId of sortResult.order) {
      const upstream = this.getUpstream(nodeId);
      if (upstream.length === 0) {
        levelMap.set(nodeId, 0);
      } else {
        const maxUpstreamLevel = Math.max(...upstream.map((p) => levelMap.get(p) ?? 0));
        levelMap.set(nodeId, maxUpstreamLevel + 1);
      }
    }

    const maxLevel = Math.max(...levelMap.values());
    const levels: DagLevel[] = [];

    for (let levelIndex = 0; levelIndex <= maxLevel; levelIndex += 1) {
      const nodeIds = sortResult.order.filter((id) => levelMap.get(id) === levelIndex);
      levels.push({ levelIndex, nodeIds });
    }

    return levels;
  }

  public computeCriticalPath(
    customDurations?: Readonly<Record<DagNodeId, number>>
  ): DagCriticalPathResult {
    if (this.nodes.size === 0) {
      return { path: [], totalDurationMs: 0 };
    }

    const sortResult = this.topologicalSort();
    if (!sortResult.success) {
      throw new Error('DAG contains cycles; cannot compute critical path');
    }

    const getNodeDuration = (id: DagNodeId): number => {
      if (customDurations && id in customDurations) {
        return customDurations[id] ?? 0;
      }
      return this.nodes.get(id)?.durationMs ?? 0;
    };

    const maxDistance = new Map<DagNodeId, number>();
    const predecessor = new Map<DagNodeId, DagNodeId | undefined>();

    for (const nodeId of sortResult.order) {
      const dur = getNodeDuration(nodeId);
      const upstream = this.getUpstream(nodeId);

      if (upstream.length === 0) {
        maxDistance.set(nodeId, dur);
        predecessor.set(nodeId, undefined);
      } else {
        let bestPred: DagNodeId | undefined;
        let maxPredDist = -1;

        for (const predId of upstream) {
          const predDist = maxDistance.get(predId) ?? 0;
          if (predDist > maxPredDist) {
            maxPredDist = predDist;
            bestPred = predId;
          }
        }

        maxDistance.set(nodeId, Math.max(0, maxPredDist) + dur);
        predecessor.set(nodeId, bestPred);
      }
    }

    let endNode: DagNodeId = sortResult.order[0]!;
    let maxTotal = maxDistance.get(endNode) ?? 0;

    for (const nodeId of sortResult.order) {
      const dist = maxDistance.get(nodeId) ?? 0;
      if (dist > maxTotal) {
        maxTotal = dist;
        endNode = nodeId;
      }
    }

    const path: DagNodeId[] = [];
    let current: DagNodeId | undefined = endNode;
    while (current !== undefined) {
      path.push(current);
      current = predecessor.get(current);
    }
    path.reverse();

    return { path, totalDurationMs: maxTotal };
  }

  public projectStatuses(
    executedStatuses: Readonly<Record<DagNodeId, DagNodeStatus | ExecutedNodeStatus>>
  ): DagGraph {
    const failedNodes = new Set<DagNodeId>();
    for (const [id, node] of this.nodes.entries()) {
      if (executedStatuses[id] === 'failed' || node.status === 'failed') {
        failedNodes.add(id);
      }
    }

    const blockedNodes = new Set<DagNodeId>();
    for (const failedId of failedNodes) {
      for (const dependentId of this.getTransitiveDependents(failedId)) {
        blockedNodes.add(dependentId);
      }
    }

    const updatedGraph = new DagGraph();
    for (const node of this.nodes.values()) {
      let status: DagNodeStatus;
      if (executedStatuses[node.id] === 'failed') {
        status = 'failed';
      } else if (blockedNodes.has(node.id)) {
        status = 'blocked';
      } else if (executedStatuses[node.id] !== undefined) {
        status = executedStatuses[node.id]!;
      } else {
        status = node.status;
      }

      updatedGraph.addNode({ ...node, status });
    }

    for (const edge of this.getEdges()) {
      updatedGraph.addEdge(edge.from, edge.to, edge.label);
    }

    return updatedGraph;
  }

  public clone(): DagGraph {
    const cloned = new DagGraph();
    for (const node of this.nodes.values()) {
      cloned.addNode({ ...node });
    }
    for (const edge of this.getEdges()) {
      cloned.addEdge(edge.from, edge.to, edge.label);
    }
    return cloned;
  }
}
