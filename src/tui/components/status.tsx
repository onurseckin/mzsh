import type { TuiInventorySummary } from '../types';

export interface StatusProps {
  readonly inventory: TuiInventorySummary;
}

export function Status({ inventory }: StatusProps): React.ReactNode {
  return (
    <box style={{ flexDirection: 'row', gap: 2 }}>
      <text fg="#a3be8c">{`healthy ${inventory.healthy}`}</text>
      <text fg="#ebcb8b">{`attention ${inventory.attention}`}</text>
    </box>
  );
}
