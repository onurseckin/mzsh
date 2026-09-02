import type { CatalogCommand, CatalogFlag } from './types';

export const applyFlag: CatalogFlag = {
  name: 'apply',
  value: 'boolean',
  description: 'Apply the reviewed transaction instead of showing its plan.',
};
export const planIdFlag: CatalogFlag = {
  name: 'plan-id',
  value: 'reviewed-plan-id',
  description: 'Use the exact reviewed plan identifier from the dry-run output.',
};
export const confirmFlag: CatalogFlag = {
  name: 'confirm',
  value: 'confirmation',
  description: 'Confirm the reviewed plan with the literal value APPLY.',
};
export const auditJsonFlag: CatalogFlag = {
  name: 'json',
  value: 'boolean',
  description: 'Render the audit report as JSON.',
};
export const inventoryJsonFlag: CatalogFlag = {
  name: 'json',
  value: 'boolean',
  description: 'Render inventory metadata as JSON.',
};
export const envJsonFlag: CatalogFlag = {
  name: 'json',
  value: 'boolean',
  description: 'Render redacted environment metadata as JSON.',
};
export const dagJsonFlag: CatalogFlag = {
  name: 'json',
  value: 'boolean',
  description: 'Render the execution plan or simulation trace as JSON.',
};
export const formatFlag: CatalogFlag = {
  name: 'format',
  value: 'format-style',
  description: 'Visual rendering format: box, tree, or compact.',
};
export const criticalPathFlag: CatalogFlag = {
  name: 'critical-path',
  value: 'boolean',
  description: 'Highlight tasks along the critical execution path.',
};
export const simulateFlag: CatalogFlag = {
  name: 'simulate',
  value: 'boolean',
  description: 'Simulate step-by-step parallel wave execution.',
};
export const filterFlag: CatalogFlag = {
  name: 'filter',
  value: 'status-filter',
  description: 'Filter graph tasks by execution status.',
};
export const workflowFlag: CatalogFlag = {
  name: 'workflow',
  value: 'string',
  description: 'Select a predefined workflow by identifier.',
};
export const sourceFlag: CatalogFlag = {
  name: 'source',
  value: 'absolute-path',
  description: 'Use an absolute checkout path.',
};
export const legacySourceFlag: CatalogFlag = {
  name: 'legacy-source',
  value: 'absolute-path',
  description: 'Inspect one absolute legacy configuration path during adoption.',
};

const navigation = [
  { screen: 'dashboard', keys: ['g', 'd'] },
  { screen: 'plan-review', keys: ['g', 'p'] },
  { screen: 'history', keys: ['g', 'h'] },
  { screen: 'dag', keys: ['g', 'g'] },
] as const;

function tui(keys: readonly ['space', string]) {
  return { keys, leader: 'space' as const, navigation };
}

export const commands: readonly CatalogCommand[] = [
  {
    name: 'audit',
    summary: 'Inspect the local managed-shell environment.',
    risk: 'read-only',
    available: true,
    palette: { keywords: ['audit', 'inspect'] },
    tui: tui(['space', 'a']),
    parser: { kind: 'audit', flags: [sourceFlag, auditJsonFlag], positional: 'none' },
  },
  {
    name: 'bootstrap',
    summary: 'Plan or apply initial managed-shell adoption.',
    risk: 'destructive',
    available: true,
    palette: { keywords: ['bootstrap', 'adopt'] },
    tui: tui(['space', 'b']),
    parser: {
      kind: 'bootstrap',
      flags: [
        { ...sourceFlag, required: true },
        legacySourceFlag,
        applyFlag,
        planIdFlag,
        confirmFlag,
      ],
      positional: 'none',
    },
  },
  {
    name: 'update',
    summary: 'Plan or apply a local managed update.',
    risk: 'destructive',
    available: true,
    palette: { keywords: ['update', 'plan'] },
    tui: tui(['space', 'u']),
    parser: { kind: 'update', flags: [applyFlag, planIdFlag, confirmFlag], positional: 'none' },
  },
  {
    name: 'rollback',
    summary: 'Restore one recorded adoption transaction.',
    risk: 'destructive',
    available: true,
    palette: { keywords: ['rollback', 'receipt'] },
    tui: tui(['space', 'r']),
    parser: {
      kind: 'rollback',
      flags: [applyFlag, planIdFlag, confirmFlag],
      positional: 'receipt-id',
    },
  },
  {
    name: 'setup',
    summary: 'Set up the managed MZSH lifecycle.',
    risk: 'destructive',
    available: true,
    palette: { keywords: ['setup', 'install'] },
    tui: tui(['space', 's']),
    parser: { kind: 'setup', flags: [applyFlag, planIdFlag, confirmFlag], positional: 'none' },
  },
  {
    name: 'history',
    summary: 'Inspect recorded managed action history.',
    risk: 'read-only',
    available: false,
    palette: { keywords: ['history', 'receipts'] },
    tui: tui(['space', 'h']),
    parser: { kind: 'placeholder', flags: [], positional: 'none' },
  },
  {
    name: 'inventory',
    summary: 'Inspect observed machine inventory.',
    risk: 'read-only',
    available: true,
    palette: { keywords: ['inventory', 'discover'] },
    tui: tui(['space', 'i']),
    parser: { kind: 'inventory', flags: [inventoryJsonFlag], positional: 'optional-category' },
  },
  {
    name: 'env',
    summary: 'Inspect private environment metadata or open its protected setter.',
    risk: 'sensitive',
    available: true,
    palette: { keywords: ['env', 'private'] },
    tui: tui(['space', 'e']),
    parser: { kind: 'env', flags: [envJsonFlag], positional: 'environment-operation' },
  },
  {
    name: 'dag',
    summary: 'Inspect task execution dependency graphs and parallel workflow waves.',
    risk: 'read-only',
    available: true,
    palette: { keywords: ['dag', 'workflow', 'tasks', 'graph'] },
    tui: tui(['space', 'g']),
    parser: {
      kind: 'dag',
      flags: [workflowFlag, formatFlag, criticalPathFlag, simulateFlag, filterFlag, dagJsonFlag],
      positional: 'optional-workflow',
    },
  },
  {
    name: 'config',
    summary: 'Launch interactive config file navigator.',
    risk: 'read-only',
    available: true,
    palette: { keywords: ['config', 'files'] },
    tui: tui(['space', 'c']),
    parser: {
      kind: 'config',
      flags: [{ name: 'open-type', value: 'string', description: 'Open type' }],
      positional: 'none',
    },
  },
  {
    name: 'tui',
    summary: 'Open the full-screen MZSH interface.',
    risk: 'read-only',
    available: true,
    palette: { keywords: ['tui', 'interactive'] },
    tui: tui(['space', 't']),
    parser: { kind: 'tui', flags: [], positional: 'none' },
  },
];
