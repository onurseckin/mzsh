import type { TuiInventorySummary } from '../types';

export interface StatusProps {
  readonly inventory: TuiInventorySummary;
  readonly detailed?: boolean;
}

export function Status({ inventory, detailed = false }: StatusProps): React.ReactNode {
  const total = inventory.total ?? inventory.healthy + inventory.attention;
  const isOptimal = inventory.attention === 0;

  return (
    <box style={{ flexDirection: 'row', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
      <text fg={isOptimal ? '#a3be8c' : '#ebcb8b'}>
        {isOptimal ? '[✔ OPTIMAL]' : '[▲ ATTENTION]'}
      </text>
      <text fg="#a3be8c">{`✔ ${inventory.healthy} healthy`}</text>
      <text fg={inventory.attention > 0 ? '#ebcb8b' : '#616e88'}>
        {`▲ ${inventory.attention} attention`}
      </text>
      {detailed || inventory.total !== undefined ? (
        <text fg="#81a1c1">{`● ${total} total components`}</text>
      ) : null}
    </box>
  );
}
