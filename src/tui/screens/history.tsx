import type { TuiHistoryEntry, TuiHistoryResult, TuiViewModel } from '../types';

export interface HistoryProps {
  readonly viewModel: TuiViewModel;
}

interface ResultBadgeInfo {
  readonly badge: string;
  readonly color: string;
}

function getResultBadge(result: TuiHistoryResult): ResultBadgeInfo {
  switch (result) {
    case 'applied':
      return { badge: '[✔ APPLIED]', color: '#a3be8c' };
    case 'failed':
      return { badge: '[✖ FAILED]', color: '#bf616a' };
    case 'rolled_back':
      return { badge: '[↺ ROLLED_BACK]', color: '#ebcb8b' };
    default: {
      const exhaustiveCheck: never = result;
      return { badge: `[● ${String(exhaustiveCheck).toUpperCase()}]`, color: '#81a1c1' };
    }
  }
}

export function History({ viewModel }: HistoryProps): React.ReactNode {
  const history = viewModel.history;

  if (history.length === 0) {
    return (
      <box
        borderStyle="rounded"
        borderColor="#434c5e"
        title=" Transaction History & Audit Trail "
        titleColor="#88c0d0"
        style={{ flexDirection: 'column', gap: 1, padding: 1, width: '100%' }}
      >
        <text fg="#81a1c1">◇ No recorded transactions</text>
        <text fg="#d8dee9">
          No configuration mutations, audits, or lifecycle operations have been recorded yet.
        </text>
        <box style={{ flexDirection: 'column', gap: 0, marginTop: 1 }}>
          <text fg="#88c0d0">Recommended actions:</text>
          <text fg="#eceff4">• Run [&lt;Space&gt; a] to audit current environment</text>
          <text fg="#eceff4">• Run [&lt;Space&gt; b] to plan and apply initial bootstrap</text>
          <text fg="#eceff4">• Run [&lt;Space&gt; i] to inspect inventory components</text>
        </box>
        <box style={{ marginTop: 1 }}>
          <text fg="#616e88">
            Every applied plan and rollback creates an immutable audit receipt in cache storage.
          </text>
        </box>
      </box>
    );
  }

  return (
    <box
      borderStyle="rounded"
      borderColor="#434c5e"
      title={` Transaction Timeline (${history.length} events) `}
      titleColor="#88c0d0"
      style={{ flexDirection: 'column', gap: 1, padding: 1, width: '100%' }}
    >
      <text fg="#81a1c1">{`Chronological Transaction Log • Most recent transactions listed`}</text>

      <box style={{ flexDirection: 'column', gap: 1, marginTop: 1 }}>
        {history.map((entry: TuiHistoryEntry, idx: number) => {
          const { badge, color } = getResultBadge(entry.result);
          const planId = entry.planId ?? `plan-${entry.action}-${idx + 1}`;
          const targets = entry.targets ?? ['~/.zshrc', '~/.config/mzsh'];

          return (
            <box
              key={`${entry.action}-${entry.occurredAt}-${idx}`}
              borderStyle="single"
              borderColor="#3b4252"
              style={{ flexDirection: 'column', paddingLeft: 1, paddingRight: 1, gap: 0 }}
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
                  <text fg="#81a1c1">{`● ${entry.occurredAt}`}</text>
                  <text fg="#eceff4">{`Action: ${entry.action.toUpperCase()}`}</text>
                </box>
                <text fg={color}>{badge}</text>
              </box>

              <box style={{ flexDirection: 'row', gap: 2, marginTop: 0, flexWrap: 'wrap' }}>
                <text fg="#81a1c1">{`Plan ID: ${planId}`}</text>
                <text fg="#d8dee9">{`Targets: ${targets.join(', ')}`}</text>
              </box>

              {entry.details !== undefined ? (
                <box style={{ marginTop: 0, flexWrap: 'wrap' }}>
                  <text fg="#88c0d0">{`Details: ${entry.details}`}</text>
                </box>
              ) : null}
            </box>
          );
        })}
      </box>
    </box>
  );
}
