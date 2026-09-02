import type { DagGraph } from './dag-graph';
import {
  type DagNode,
  type DagNodeId,
  type DagRenderOptions,
  getDagStatusMarker,
} from './dag-types';

interface BoxGlyphs {
  readonly tl: string;
  readonly tr: string;
  readonly bl: string;
  readonly br: string;
  readonly h: string;
  readonly v: string;
  readonly downArrow: string;
  readonly teeUp: string;
  readonly teeDown: string;
  readonly cross: string;
}

const UNICODE_BOX_GLYPHS: BoxGlyphs = {
  tl: '┌',
  tr: '┐',
  bl: '└',
  br: '┘',
  h: '─',
  v: '│',
  downArrow: '▼',
  teeUp: '┴',
  teeDown: '┬',
  cross: '┼',
};

const ASCII_BOX_GLYPHS: BoxGlyphs = {
  tl: '+',
  tr: '+',
  bl: '+',
  br: '+',
  h: '-',
  v: '|',
  downArrow: 'v',
  teeUp: '+',
  teeDown: '+',
  cross: '+',
};

function formatNodeLabel(
  node: DagNode,
  options: DagRenderOptions,
  isCritical: boolean,
  unicode: boolean
): string {
  const parts: string[] = [];
  if (options.showStatus !== false) {
    parts.push(getDagStatusMarker(node.status, unicode));
  }
  parts.push(node.name || node.id);
  if (options.showDuration !== false && node.durationMs !== undefined) {
    parts.push(`(${node.durationMs}ms)`);
  }
  if (options.highlightCriticalPath && isCritical) {
    parts.push(unicode ? '★' : '*');
  }
  return parts.join(' ');
}

function renderCompact(graph: DagGraph, options: DagRenderOptions, unicode: boolean): string {
  if (graph.getNodes().length === 0) return '(empty graph)';
  const cycle = graph.detectCycles();
  if (cycle.hasCycle) return `[Cycle detected: ${(cycle.cyclePath ?? []).join(' -> ')}]`;

  const levels = graph.computeLevels();
  const critNodes = options.highlightCriticalPath
    ? new Set(graph.computeCriticalPath().path)
    : new Set<DagNodeId>();
  const arrow = unicode ? '  ↓' : '  v';
  const lines: string[] = [];

  for (let i = 0; i < levels.length; i += 1) {
    const level = levels[i]!;
    const levelLabels = level.nodeIds.map((id) =>
      formatNodeLabel(graph.getNode(id)!, options, critNodes.has(id), unicode)
    );
    lines.push(`Level ${level.levelIndex}: ${levelLabels.join('  ')}`);
    if (i < levels.length - 1) lines.push(arrow);
  }
  return lines.join('\n');
}

function renderTree(graph: DagGraph, options: DagRenderOptions, unicode: boolean): string {
  const nodes = graph.getNodes();
  if (nodes.length === 0) return '(empty graph)';
  const cycle = graph.detectCycles();
  if (cycle.hasCycle) return `[Cycle detected: ${(cycle.cyclePath ?? []).join(' -> ')}]`;

  const critNodes = options.highlightCriticalPath
    ? new Set(graph.computeCriticalPath().path)
    : new Set<DagNodeId>();
  const roots = nodes.filter((node) => graph.getUpstream(node.id).length === 0);
  const startNodes = roots.length > 0 ? roots : nodes;

  const branch = unicode ? '├── ' : '|-- ';
  const lastBranch = unicode ? '└── ' : '\\-- ';
  const vertical = unicode ? '│   ' : '|   ';
  const empty = '    ';
  const lines: string[] = [];

  const renderSubtree = (nodeId: DagNodeId, prefix: string, isLast: boolean, isRoot: boolean) => {
    const node = graph.getNode(nodeId);
    if (!node) return;
    const label = formatNodeLabel(node, options, critNodes.has(nodeId), unicode);
    lines.push(isRoot ? label : `${prefix}${isLast ? lastBranch : branch}${label}`);

    const nextPrefix = isRoot ? '' : `${prefix}${isLast ? empty : vertical}`;
    const children = graph.getDownstream(nodeId);
    for (let i = 0; i < children.length; i += 1) {
      renderSubtree(children[i]!, nextPrefix, i === children.length - 1, false);
    }
  };

  for (const root of startNodes) renderSubtree(root.id, '', true, true);
  return lines.join('\n');
}

interface RenderedBoxLevel {
  readonly lines: readonly string[];
  readonly width: number;
  readonly centers: readonly number[];
}

function renderBoxLevel(
  nodeIds: readonly DagNodeId[],
  graph: DagGraph,
  options: DagRenderOptions,
  critNodes: ReadonlySet<DagNodeId>,
  glyphs: BoxGlyphs,
  unicode: boolean
): RenderedBoxLevel {
  const topParts: string[] = [];
  const midParts: string[] = [];
  const botParts: string[] = [];
  const centers: number[] = [];
  let offset = 0;

  for (let i = 0; i < nodeIds.length; i += 1) {
    const id = nodeIds[i]!;
    const node = graph.getNode(id)!;
    const label = formatNodeLabel(node, options, critNodes.has(id), unicode);
    const boxWidth = label.length + 4;

    topParts.push(`${glyphs.tl}${glyphs.h.repeat(boxWidth - 2)}${glyphs.tr}`);
    midParts.push(`${glyphs.v} ${label} ${glyphs.v}`);
    botParts.push(`${glyphs.bl}${glyphs.h.repeat(boxWidth - 2)}${glyphs.br}`);
    centers.push(offset + Math.floor(boxWidth / 2));
    offset += boxWidth;

    if (i < nodeIds.length - 1) {
      topParts.push('  ');
      midParts.push('  ');
      botParts.push('  ');
      offset += 2;
    }
  }

  return {
    lines: [topParts.join(''), midParts.join(''), botParts.join('')],
    width: offset,
    centers,
  };
}

function setChar(arr: string[], pos: number, char: string): void {
  while (arr.length <= pos) arr.push(' ');
  arr[pos] = char;
}

function buildConnector(
  prevCenters: readonly number[],
  nextCenters: readonly number[],
  glyphs: BoxGlyphs
): readonly string[] {
  if (prevCenters.length === 0 || nextCenters.length === 0) return [];

  if (prevCenters.length === 1 && nextCenters.length === 1) {
    const from = prevCenters[0]!;
    const to = nextCenters[0]!;
    if (from === to) {
      const l1: string[] = [];
      const l2: string[] = [];
      setChar(l1, from, glyphs.v);
      setChar(l2, to, glyphs.downArrow);
      return [l1.join('').trimEnd(), l2.join('').trimEnd()];
    }
    const min = Math.min(from, to);
    const max = Math.max(from, to);
    const l1: string[] = [];
    const l2: string[] = [];
    const l3: string[] = [];
    setChar(l1, from, glyphs.v);
    for (let c = min; c <= max; c += 1) setChar(l2, c, glyphs.h);
    setChar(l2, min, from < to ? glyphs.tl : glyphs.tr);
    setChar(l2, max, from < to ? glyphs.br : glyphs.bl);
    setChar(l3, to, glyphs.downArrow);
    return [l1.join('').trimEnd(), l2.join('').trimEnd(), l3.join('').trimEnd()];
  }

  if (prevCenters.length === 1 && nextCenters.length > 1) {
    const from = prevCenters[0]!;
    const minB = Math.min(...nextCenters);
    const maxB = Math.max(...nextCenters);
    const min = Math.min(from, minB);
    const max = Math.max(from, maxB);
    const l1: string[] = [];
    const l2: string[] = [];
    const l3: string[] = [];
    setChar(l1, from, glyphs.v);
    for (let c = min; c <= max; c += 1) setChar(l2, c, glyphs.h);
    setChar(l2, minB, glyphs.tl);
    setChar(l2, maxB, glyphs.tr);
    for (const b of nextCenters) {
      if (b !== minB && b !== maxB) setChar(l2, b, glyphs.teeDown);
    }
    if (from === minB) setChar(l2, from, glyphs.tl);
    else if (from === maxB) setChar(l2, from, glyphs.tr);
    else if (nextCenters.includes(from)) setChar(l2, from, glyphs.cross);
    else setChar(l2, from, glyphs.teeUp);
    for (const b of nextCenters) setChar(l3, b, glyphs.downArrow);
    return [l1.join('').trimEnd(), l2.join('').trimEnd(), l3.join('').trimEnd()];
  }

  if (prevCenters.length > 1 && nextCenters.length === 1) {
    const to = nextCenters[0]!;
    const minA = Math.min(...prevCenters);
    const maxA = Math.max(...prevCenters);
    const min = Math.min(to, minA);
    const max = Math.max(to, maxA);
    const l1: string[] = [];
    const l2: string[] = [];
    const l3: string[] = [];
    for (const a of prevCenters) setChar(l1, a, glyphs.v);
    for (let c = min; c <= max; c += 1) setChar(l2, c, glyphs.h);
    setChar(l2, minA, glyphs.bl);
    setChar(l2, maxA, glyphs.br);
    for (const a of prevCenters) {
      if (a !== minA && a !== maxA) setChar(l2, a, glyphs.teeUp);
    }
    if (to === minA) setChar(l2, to, glyphs.bl);
    else if (to === maxA) setChar(l2, to, glyphs.br);
    else if (prevCenters.includes(to)) setChar(l2, to, glyphs.cross);
    else setChar(l2, to, glyphs.teeDown);
    setChar(l3, to, glyphs.downArrow);
    return [l1.join('').trimEnd(), l2.join('').trimEnd(), l3.join('').trimEnd()];
  }

  const minA = Math.min(...prevCenters);
  const maxA = Math.max(...prevCenters);
  const minB = Math.min(...nextCenters);
  const maxB = Math.max(...nextCenters);
  const mid = Math.round((minA + maxA + minB + maxB) / 4);
  const l1: string[] = [];
  const l2: string[] = [];
  const l3: string[] = [];
  const l4: string[] = [];
  const l5: string[] = [];

  for (const a of prevCenters) setChar(l1, a, glyphs.v);
  for (let c = Math.min(minA, mid); c <= Math.max(maxA, mid); c += 1) setChar(l2, c, glyphs.h);
  setChar(l2, minA, glyphs.bl);
  setChar(l2, maxA, glyphs.br);
  for (const a of prevCenters) if (a !== minA && a !== maxA) setChar(l2, a, glyphs.teeUp);
  setChar(l2, mid, glyphs.teeDown);
  setChar(l3, mid, glyphs.v);
  for (let c = Math.min(minB, mid); c <= Math.max(maxB, mid); c += 1) setChar(l4, c, glyphs.h);
  setChar(l4, minB, glyphs.tl);
  setChar(l4, maxB, glyphs.tr);
  for (const b of nextCenters) if (b !== minB && b !== maxB) setChar(l4, b, glyphs.teeDown);
  setChar(l4, mid, glyphs.teeUp);
  for (const b of nextCenters) setChar(l5, b, glyphs.downArrow);

  return [
    l1.join('').trimEnd(),
    l2.join('').trimEnd(),
    l3.join('').trimEnd(),
    l4.join('').trimEnd(),
    l5.join('').trimEnd(),
  ];
}

function renderBox(graph: DagGraph, options: DagRenderOptions, unicode: boolean): string {
  if (graph.getNodes().length === 0) return '(empty graph)';
  const cycle = graph.detectCycles();
  if (cycle.hasCycle) return `[Cycle detected: ${(cycle.cyclePath ?? []).join(' -> ')}]`;

  const glyphs = unicode ? UNICODE_BOX_GLYPHS : ASCII_BOX_GLYPHS;
  const levels = graph.computeLevels();
  const critNodes = options.highlightCriticalPath
    ? new Set(graph.computeCriticalPath().path)
    : new Set<DagNodeId>();

  const renderedLevels = levels.map((lvl) =>
    renderBoxLevel(lvl.nodeIds, graph, options, critNodes, glyphs, unicode)
  );
  const maxWidth = Math.max(...renderedLevels.map((lvl) => lvl.width));
  const alignedLevels = renderedLevels.map((lvl) => {
    const pad = ' '.repeat(Math.max(0, Math.floor((maxWidth - lvl.width) / 2)));
    return {
      lines: lvl.lines.map((line) => `${pad}${line}`),
      centers: lvl.centers.map((c) => c + pad.length),
    };
  });

  const outputLines: string[] = [];
  for (let i = 0; i < alignedLevels.length; i += 1) {
    const current = alignedLevels[i]!;
    for (const line of current.lines) outputLines.push(line);
    if (i < alignedLevels.length - 1) {
      const next = alignedLevels[i + 1]!;
      const connectors = buildConnector(current.centers, next.centers, glyphs);
      for (const line of connectors) outputLines.push(line);
    }
  }
  return outputLines.join('\n');
}

export function renderDag(graph: DagGraph, options: DagRenderOptions = {}): string {
  const format = options.format ?? 'box';
  const unicode = options.unicode ?? true;
  if (format === 'compact') return renderCompact(graph, options, unicode);
  if (format === 'tree') return renderTree(graph, options, unicode);
  return renderBox(graph, options, unicode);
}
