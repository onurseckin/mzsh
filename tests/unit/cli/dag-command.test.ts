import { describe, expect, test } from 'bun:test';
import { runDagCommand } from '../../../src/cli/dag-command';
import { runMzshCli, type RunMzshCliDependencies } from '../../../src/cli/run-cli';

function createMockDependencies(): { dependencies: RunMzshCliDependencies; output: string[] } {
  const output: string[] = [];
  const dependencies: RunMzshCliDependencies = {
    home: '/home/test',
    xdgConfig: '/home/test/.config',
    xdgCache: '/home/test/.cache',
    repositoryRoot: '/repo/root',
    write: (msg: string) => output.push(msg),
  };
  return { dependencies, output };
}

describe('dag command', () => {
  describe('direct command execution', () => {
    test('renders default bootstrap workflow in box format', () => {
      const { dependencies, output } = createMockDependencies();
      const exitCode = runDagCommand({ kind: 'dag', json: false }, dependencies);

      expect(exitCode).toBe(0);
      expect(output).toHaveLength(1);
      const text = output[0]!;
      expect(text).toContain('Validate Environment');
      expect(text).toContain('Backup Legacy Configs');
      expect(text).toContain('Verify Installation');
      expect(text).toContain('┌');
      expect(text).toContain('┘');
    });

    test('renders tree format when requested', () => {
      const { dependencies, output } = createMockDependencies();
      const exitCode = runDagCommand({ kind: 'dag', format: 'tree', json: false }, dependencies);

      expect(exitCode).toBe(0);
      expect(output).toHaveLength(1);
      const text = output[0]!;
      expect(text).toContain('├──');
      expect(text).toContain('Validate Environment');
    });

    test('renders compact format when requested', () => {
      const { dependencies, output } = createMockDependencies();
      const exitCode = runDagCommand({ kind: 'dag', format: 'compact', json: false }, dependencies);

      expect(exitCode).toBe(0);
      expect(output).toHaveLength(1);
      const text = output[0]!;
      expect(text).toContain('Level 0:');
      expect(text).toContain('↓');
      expect(text).toContain('Validate Environment');
    });

    test('highlights critical path when requested', () => {
      const { dependencies, output } = createMockDependencies();
      const exitCode = runDagCommand(
        { kind: 'dag', format: 'compact', criticalPath: true, json: false },
        dependencies
      );

      expect(exitCode).toBe(0);
      expect(output).toHaveLength(1);
      expect(output[0]!).toContain('★');
    });

    test('outputs JSON execution plan when json flag is set', () => {
      const { dependencies, output } = createMockDependencies();
      const exitCode = runDagCommand({ kind: 'dag', json: true }, dependencies);

      expect(exitCode).toBe(0);
      expect(output).toHaveLength(1);
      const plan = JSON.parse(output[0]!);
      expect(plan.workflowId).toBe('mzsh-bootstrap');
      expect(plan.waves.length).toBeGreaterThan(0);
      expect(plan.criticalPath.length).toBeGreaterThan(0);
      expect(plan.totalTasks).toBe(6);
    });

    test('simulates wave execution in text mode', () => {
      const { dependencies, output } = createMockDependencies();
      const exitCode = runDagCommand({ kind: 'dag', simulate: true, json: false }, dependencies);

      expect(exitCode).toBe(0);
      expect(output).toHaveLength(1);
      const text = output[0]!;
      expect(text).toContain('Simulating workflow: MZSH Bootstrap');
      expect(text).toContain('Wave 1/');
      expect(text).toContain('Simulation completed successfully.');
    });

    test('simulates wave execution in JSON mode', () => {
      const { dependencies, output } = createMockDependencies();
      const exitCode = runDagCommand({ kind: 'dag', simulate: true, json: true }, dependencies);

      expect(exitCode).toBe(0);
      expect(output).toHaveLength(1);
      const data = JSON.parse(output[0]!);
      expect(data.workflowId).toBe('mzsh-bootstrap');
      expect(data.waves.length).toBeGreaterThan(0);
      expect(data.waves[0].tasks.length).toBeGreaterThan(0);
    });

    test('renders named predefined workflow mzsh-ci-pipeline', () => {
      const { dependencies, output } = createMockDependencies();
      const exitCode = runDagCommand(
        { kind: 'dag', workflow: 'mzsh-ci-pipeline', format: 'compact', json: false },
        dependencies
      );

      expect(exitCode).toBe(0);
      expect(output).toHaveLength(1);
      expect(output[0]!).toContain('ESLint & Formatting');
      expect(output[0]!).toContain('Package Validation');
    });

    test('filters graph nodes by status', () => {
      const { dependencies, output } = createMockDependencies();
      const exitCode = runDagCommand(
        { kind: 'dag', filter: 'completed', format: 'compact', json: false },
        dependencies
      );

      expect(exitCode).toBe(0);
      expect(output).toHaveLength(1);
      // All nodes in pristine workflow are pending, so completed filter yields empty graph
      expect(output[0]!).toBe('(empty graph)');
    });

    test('returns error for unknown workflow', () => {
      const { dependencies, output } = createMockDependencies();
      const exitCode = runDagCommand(
        { kind: 'dag', workflow: 'unknown-wf-id', json: false },
        dependencies
      );

      expect(exitCode).toBe(1);
      expect(output).toHaveLength(1);
      expect(output[0]!).toContain('MZSH_USAGE_unknown-workflow');
    });
  });

  describe('cli integration via runMzshCli', () => {
    test('dispatches dag command through cli entry point', () => {
      const { dependencies, output } = createMockDependencies();
      const exitCode = runMzshCli(['dag', '--format', 'compact'], dependencies);

      expect(exitCode).toBe(0);
      expect(output).toHaveLength(1);
      expect(output[0]!).toContain('Level 0:');
    });

    test('dispatches dag command with workflow argument and json output', () => {
      const { dependencies, output } = createMockDependencies();
      const exitCode = runMzshCli(['dag', 'mzsh-audit-fix', '--json'], dependencies);

      expect(exitCode).toBe(0);
      expect(output).toHaveLength(1);
      const plan = JSON.parse(output[0]!);
      expect(plan.workflowId).toBe('mzsh-audit-fix');
    });
  });
});
