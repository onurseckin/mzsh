import type { TuiAction } from '../types';

export interface ActionStripProps {
  readonly actions: readonly TuiAction[];
}

export function ActionStrip({ actions }: ActionStripProps): React.ReactNode {
  return (
    <box style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 1 }}>
      {actions.map((action) => (
        <text key={action.id} fg={action.enabled ? '#88c0d0' : '#d08770'}>
          {`${action.keys.join(' ')} ${action.label}${action.enabled ? '' : ' (review required)'}`}
        </text>
      ))}
    </box>
  );
}
