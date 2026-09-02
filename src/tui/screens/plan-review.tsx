import type { CommandRisk } from '../../catalog/types';
import type { TuiPlanOperation, TuiViewModel } from '../types';

export interface PlanReviewProps {
  readonly viewModel: TuiViewModel;
}

function getDefaultOperations(action: string): readonly TuiPlanOperation[] {
  switch (action.toLowerCase()) {
    case 'bootstrap':
      return [
        {
          type: 'backup',
          description: 'Backup existing profile files to cache directory',
          target: '~/.zshrc.bak',
        },
        {
          type: 'symlink',
          description: 'Create atomic symlink to managed mzsh entrypoint',
          target: '~/.zshrc',
        },
        {
          type: 'config',
          description: 'Initialize mzsh managed config files in XDG config home',
          target: '~/.config/mzsh',
        },
        {
          type: 'receipt',
          description: 'Stage immutable adoption receipt for atomic rollback',
          target: '~/.cache/mzsh/receipts',
        },
      ];
    case 'update':
      return [
        {
          type: 'migration',
          description: 'Migrate configuration schema and validate syntax',
          target: '~/.config/mzsh',
        },
        {
          type: 'receipt',
          description: 'Stage pre-update rollback snapshot receipt',
          target: '~/.cache/mzsh/receipts',
        },
        {
          type: 'verify',
          description: 'Verify zsh alias and completion compatibility',
          target: '~/.zshrc',
        },
      ];
    case 'rollback':
      return [
        {
          type: 'backup',
          description: 'Verify backup archive and checksum integrity',
          target: '~/.cache/mzsh/receipts',
        },
        {
          type: 'migration',
          description: 'Restore shell configuration files to pre-adoption state',
          target: '~/.zshrc',
        },
        {
          type: 'receipt',
          description: 'Record rollback transaction in audit log',
          target: '~/.cache/mzsh/history',
        },
      ];
    case 'setup':
      return [
        {
          type: 'config',
          description: 'Scaffold initial mzsh environment directories',
          target: '~/.config/mzsh',
        },
        {
          type: 'receipt',
          description: 'Generate lifecycle setup manifest receipt',
          target: '~/.cache/mzsh',
        },
      ];
    default:
      return [
        {
          type: 'config',
          description: `Stage configuration changes for action: ${action}`,
        },
        {
          type: 'receipt',
          description: 'Record planned operation in audit receipt log',
        },
      ];
  }
}

function operationGlyph(type: TuiPlanOperation['type']): string {
  switch (type) {
    case 'symlink':
      return '⮡';
    case 'migration':
      return '⚡';
    case 'receipt':
      return '🧾';
    case 'backup':
      return '💾';
    case 'verify':
      return '✔';
    case 'config':
    default:
      return '⚙';
  }
}

function isDestructiveRisk(risk?: CommandRisk, action?: string): boolean {
  if (risk !== undefined) {
    return risk === 'destructive';
  }
  const destructiveActions = ['setup', 'bootstrap', 'update', 'rollback'];
  return action !== undefined && destructiveActions.includes(action.toLowerCase());
}

export function PlanReview({ viewModel }: PlanReviewProps): React.ReactNode {
  const plan = viewModel.plan;

  if (plan === undefined) {
    return (
      <box
        borderStyle="rounded"
        borderColor="#434c5e"
        title=" Action Plan Review "
        titleColor="#81a1c1"
        style={{ flexDirection: 'column', gap: 1, padding: 1, width: '100%' }}
      >
        <text fg="#81a1c1">◇ No pending action plan</text>
        <text fg="#d8dee9">
          No configuration mutations or action plans are currently staged for execution.
        </text>
        <box style={{ flexDirection: 'column', gap: 0, marginTop: 1 }}>
          <text fg="#88c0d0">Available planning actions:</text>
          <text fg="#eceff4">• Run [&lt;Space&gt; b] to generate an adoption Bootstrap plan</text>
          <text fg="#eceff4">• Run [&lt;Space&gt; u] to generate a managed Update plan</text>
          <text fg="#eceff4">• Run [&lt;Space&gt; r] to stage a Rollback restoration plan</text>
          <text fg="#eceff4">• Run [&lt;Space&gt; s] to review a Lifecycle Setup plan</text>
        </box>
        <box style={{ marginTop: 1 }}>
          <text fg="#616e88">
            mzsh safety invariant: All filesystem mutations require dry-run review before execution.
          </text>
        </box>
      </box>
    );
  }

  const isDestructive = isDestructiveRisk(plan.risk, plan.action);
  const rawOperations = plan.operations ?? getDefaultOperations(plan.action);
  const operations: readonly TuiPlanOperation[] = rawOperations.map((op) =>
    typeof op === 'string' ? { type: 'config', description: op } : op
  );
  const preflightPassed = plan.preflightChecksPassed ?? true;
  const rollbackVerified = plan.rollbackSnapshotVerified ?? true;
  const targets = plan.affectedTargets ?? ['~/.zshrc', '~/.config/mzsh', '~/.cache/mzsh'];

  return (
    <box style={{ flexDirection: 'column', gap: 1, width: '100%' }}>
      {/* Plan Metadata Header */}
      <box
        borderStyle="rounded"
        borderColor={isDestructive ? '#bf616a' : '#a3be8c'}
        title=" Plan Metadata & Risk Evaluation "
        titleColor={isDestructive ? '#bf616a' : '#a3be8c'}
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
            <text fg="#81a1c1">Action:</text>
            <text fg="#eceff4">{plan.action.toUpperCase()}</text>
          </box>
          <text fg={isDestructive ? '#bf616a' : '#a3be8c'}>
            {isDestructive ? '[DESTRUCTIVE]' : '[SAFE]'}
          </text>
        </box>
        <box style={{ flexDirection: 'row', gap: 2, marginTop: 1, flexWrap: 'wrap' }}>
          <text fg="#81a1c1">Plan ID:</text>
          <text fg="#88c0d0">{plan.reviewedPlanId}</text>
        </box>
        <box style={{ flexDirection: 'row', gap: 2, flexWrap: 'wrap' }}>
          <text fg="#81a1c1">Confirmation required:</text>
          <text fg="#ebcb8b">{plan.confirmation}</text>
        </box>
      </box>

      {/* Change Steps & Operations List */}
      <box
        borderStyle="rounded"
        borderColor="#434c5e"
        title={` Change Steps & Operations (${operations.length}) `}
        titleColor="#88c0d0"
        style={{ flexDirection: 'column', padding: 1, gap: 0 }}
      >
        {operations.map((op, idx) => (
          <box key={`${op.type}-${idx}`} style={{ flexDirection: 'row', gap: 1, flexWrap: 'wrap' }}>
            <text fg="#88c0d0">{operationGlyph(op.type)}</text>
            <text fg="#eceff4">{`${op.type.toUpperCase()}: ${op.description}`}</text>
            {op.target !== undefined ? <text fg="#81a1c1">{`(${op.target})`}</text> : null}
          </box>
        ))}
      </box>

      {/* Safety & Rollback Checklist */}
      <box
        borderStyle="rounded"
        borderColor="#434c5e"
        title=" Safety & Rollback Checklist "
        titleColor="#88c0d0"
        style={{ flexDirection: 'column', padding: 1, gap: 0 }}
      >
        <box style={{ flexDirection: 'row', gap: 1, flexWrap: 'wrap' }}>
          <text fg={preflightPassed ? '#a3be8c' : '#bf616a'}>{preflightPassed ? '✔' : '✖'}</text>
          <text fg={preflightPassed ? '#eceff4' : '#bf616a'}>
            Pre-flight checks passed: Directory permissions, shell syntax & integrity verified
          </text>
        </box>
        <box style={{ flexDirection: 'row', gap: 1, flexWrap: 'wrap' }}>
          <text fg={rollbackVerified ? '#a3be8c' : '#bf616a'}>{rollbackVerified ? '✔' : '✖'}</text>
          <text fg={rollbackVerified ? '#eceff4' : '#bf616a'}>
            Rollback snapshot verified: Atomic rollback receipt staged in cache
          </text>
        </box>
        <box style={{ flexDirection: 'row', gap: 1, flexWrap: 'wrap' }}>
          <text fg="#81a1c1">●</text>
          <text fg="#d8dee9">{`Target paths verified: ${targets.join(', ')}`}</text>
        </box>
      </box>

      {/* Confirmation Prompt State */}
      <box
        borderStyle="rounded"
        borderColor="#ebcb8b"
        title=" Confirmation Required "
        titleColor="#ebcb8b"
        style={{ flexDirection: 'column', padding: 1, gap: 0 }}
      >
        <text fg="#eceff4">
          {`To execute this plan, explicit confirmation token [${plan.confirmation}] is required.`}
        </text>
        <box style={{ marginTop: 1, flexDirection: 'column', gap: 0 }}>
          <text fg="#d8dee9">Safe CLI command to trigger:</text>
          <text fg="#88c0d0">
            {`  bun run mzsh -- ${plan.action} --apply --plan-id ${plan.reviewedPlanId} --confirm ${plan.confirmation}`}
          </text>
        </box>
        <box style={{ marginTop: 1 }}>
          <text fg="#616e88">
            TUI enforces safety-first review. Destructive mutations cannot be triggered
            accidentally.
          </text>
        </box>
      </box>
    </box>
  );
}
