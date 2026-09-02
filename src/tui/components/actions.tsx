import type { CommandRisk } from '../../catalog/types';
import type { TuiAction } from '../types';

export interface ActionStripProps {
  readonly actions: readonly TuiAction[];
}

function riskColor(risk: CommandRisk): string {
  switch (risk) {
    case 'destructive':
      return '#bf616a';
    case 'sensitive':
      return '#ebcb8b';
    case 'read-only':
      return '#a3be8c';
  }
}

function riskGlyph(risk: CommandRisk): string {
  switch (risk) {
    case 'destructive':
      return '⚡';
    case 'sensitive':
      return '▲';
    case 'read-only':
      return '◇';
  }
}

function formatKeySequence(keys: readonly string[]): string {
  if (keys[0] === 'space') {
    return `<Space> ${keys.slice(1).join(' ')}`;
  }
  return keys.join(' ');
}

export function ActionStrip({ actions }: ActionStripProps): React.ReactNode {
  return (
    <box style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
      {actions.map((action) => {
        const color = riskColor(action.risk);
        const glyph = riskGlyph(action.risk);
        const keyHint = formatKeySequence(action.keys);
        const reviewText = action.enabled ? '' : ' (review required)';

        return (
          <box key={action.id} style={{ flexDirection: 'row', gap: 1, alignItems: 'center' }}>
            <text fg="#81a1c1">{`[${keyHint}]`}</text>
            <text fg="#eceff4">{`${glyph} ${action.label}`}</text>
            {reviewText !== '' ? <text fg={color}>{reviewText}</text> : null}
          </box>
        );
      })}
    </box>
  );
}
