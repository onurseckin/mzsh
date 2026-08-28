import { Status } from '../components/status';
import type { TuiViewModel } from '../types';

export interface DashboardProps {
  readonly viewModel: TuiViewModel;
}

export function Dashboard({ viewModel }: DashboardProps): React.ReactNode {
  return (
    <box style={{ flexDirection: 'column', gap: 1 }}>
      <text fg="#88c0d0">MZSH dashboard</text>
      <Status inventory={viewModel.inventory} />
      <text>{`${viewModel.history.length} recorded actions`}</text>
    </box>
  );
}
