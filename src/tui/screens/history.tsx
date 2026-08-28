import type { TuiViewModel } from '../types';

export interface HistoryProps {
  readonly viewModel: TuiViewModel;
}

export function History({ viewModel }: HistoryProps): React.ReactNode {
  return (
    <box style={{ flexDirection: 'column', gap: 1 }}>
      <text fg="#88c0d0">History</text>
      {viewModel.history.length === 0 ? (
        <text>No recorded actions.</text>
      ) : (
        viewModel.history.map((entry) => (
          <text key={`${entry.action}-${entry.occurredAt}`}>
            {`${entry.occurredAt} ${entry.action} ${entry.result}`}
          </text>
        ))
      )}
    </box>
  );
}
