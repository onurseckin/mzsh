import type { TuiEnvMode, TuiViewModel } from '../types';

export interface HeaderProps {
  readonly viewModel: TuiViewModel;
}

function envModeColor(mode: TuiEnvMode): string {
  switch (mode) {
    case 'production':
      return '#a3be8c';
    case 'development':
      return '#ebcb8b';
    case 'custom':
      return '#d08770';
  }
}

function breadcrumbColor(item: string, index: number, total: number): string {
  if (index === 0) return '#88c0d0';
  if (index === total - 1) {
    if (item.includes('Active') || item.includes('Workflow')) return '#a3be8c';
    if (item.includes('Idle')) return '#81a1c1';
    return '#ebcb8b';
  }
  return '#eceff4';
}

export function Header({ viewModel }: HeaderProps): React.ReactNode {
  const envColor = envModeColor(viewModel.envContext.envMode);

  return (
    <box
      borderStyle="rounded"
      borderColor="#434c5e"
      style={{
        flexDirection: 'column',
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        gap: 0,
      }}
    >
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <box style={{ flexDirection: 'row', gap: 1, flexWrap: 'wrap' }}>
          {viewModel.breadcrumbs.map((crumb, idx) => (
            <box key={`${crumb}-${idx}`} style={{ flexDirection: 'row', gap: 1 }}>
              {idx > 0 ? <text fg="#616e88">❯</text> : null}
              <text fg={breadcrumbColor(crumb, idx, viewModel.breadcrumbs.length)}>{crumb}</text>
            </box>
          ))}
        </box>
        <box style={{ flexDirection: 'row', gap: 2, flexWrap: 'wrap' }}>
          <text fg={envColor}>{`[env: ${viewModel.envContext.envMode}]`}</text>
          <text fg="#81a1c1">{`[${viewModel.envContext.shell}]`}</text>
          <text fg="#88c0d0">[?] Help</text>
        </box>
      </box>

      <box style={{ flexDirection: 'row', gap: 2, marginTop: 1, flexWrap: 'wrap' }}>
        {viewModel.navigationItems.map((item, index) => {
          const num = index + 1;
          return (
            <box key={item.screen} style={{ flexDirection: 'row', gap: 1, alignItems: 'center' }}>
              <text fg={item.active ? '#88c0d0' : '#d8dee9'}>
                {`${item.active ? '◆' : '◇'} [${num}] ${item.label}`}
              </text>
              <text fg="#81a1c1">{`(${item.shortcut})`}</text>
            </box>
          );
        })}
      </box>
    </box>
  );
}
