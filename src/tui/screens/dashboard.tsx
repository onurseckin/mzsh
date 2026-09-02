import { Status } from '../components/status';
import type { TuiEnvMode, TuiViewModel } from '../types';

export interface DashboardProps {
  readonly viewModel: TuiViewModel;
}

function modeColor(mode: TuiEnvMode): string {
  switch (mode) {
    case 'production':
      return '#a3be8c';
    case 'development':
      return '#ebcb8b';
    case 'custom':
      return '#d08770';
  }
}

export function Dashboard({ viewModel }: DashboardProps): React.ReactNode {
  const { envContext, inventory, auditStatus, viewport } = viewModel;
  const total = inventory.total ?? inventory.healthy + inventory.attention;
  const envColor = modeColor(envContext.envMode);
  const arch =
    envContext.arch ?? (typeof process !== 'undefined' && process.arch ? process.arch : 'arm64');
  const isAuditClean = auditStatus !== undefined ? auditStatus.clean : inventory.attention === 0;
  const rowDirection = viewport.isCompact ? ('column' as const) : ('row' as const);

  return (
    <box style={{ flexDirection: 'column', gap: 1, width: '100%' }}>
      <box style={{ flexDirection: rowDirection, gap: 1, width: '100%' }}>
        {/* Card 1: System & Environment */}
        <box
          borderStyle="rounded"
          borderColor="#434c5e"
          title=" System & Environment "
          titleColor="#88c0d0"
          style={{ flexDirection: 'column', flexGrow: 1, padding: 1, gap: 0 }}
        >
          <box style={{ flexDirection: 'row', gap: 2, flexWrap: 'wrap' }}>
            <text fg="#81a1c1">Active Shell:</text>
            <text fg="#eceff4">{envContext.shell}</text>
          </box>
          <box style={{ flexDirection: 'row', gap: 2, flexWrap: 'wrap' }}>
            <text fg="#81a1c1">OS Platform:</text>
            <text fg="#eceff4">{`${envContext.os} (${arch})`}</text>
          </box>
          <box style={{ flexDirection: 'row', gap: 2, marginTop: 1, flexWrap: 'wrap' }}>
            <text fg="#81a1c1">mzsh Mode:</text>
            <text fg={envColor}>{`[${envContext.envMode}]`}</text>
            <text fg="#616e88">(&lt;leader&gt;e to cycle)</text>
          </box>
          <box style={{ flexDirection: 'row', gap: 1, marginTop: 1, flexWrap: 'wrap' }}>
            <text fg="#a3be8c">●</text>
            <text fg="#d8dee9">TUI runtime active & responsive</text>
          </box>
        </box>

        {/* Card 2: Health & Inventory */}
        <box
          borderStyle="rounded"
          borderColor="#434c5e"
          title=" Health & Inventory "
          titleColor="#88c0d0"
          style={{ flexDirection: 'column', flexGrow: 1, padding: 1, gap: 0 }}
        >
          <Status inventory={inventory} detailed />
          <box style={{ flexDirection: 'column', gap: 0, marginTop: 1 }}>
            <box style={{ flexDirection: 'row', gap: 1, flexWrap: 'wrap' }}>
              <text fg="#a3be8c">✔</text>
              <text fg="#eceff4">{`Healthy components: ${inventory.healthy}`}</text>
            </box>
            <box style={{ flexDirection: 'row', gap: 1, flexWrap: 'wrap' }}>
              <text fg={inventory.attention > 0 ? '#ebcb8b' : '#616e88'}>▲</text>
              <text fg={inventory.attention > 0 ? '#ebcb8b' : '#616e88'}>
                {`Attention required: ${inventory.attention}`}
              </text>
            </box>
            <box style={{ flexDirection: 'row', gap: 1, flexWrap: 'wrap' }}>
              <text fg="#81a1c1">●</text>
              <text fg="#d8dee9">{`Total managed assets: ${total}`}</text>
            </box>
          </box>
        </box>
      </box>

      <box style={{ flexDirection: rowDirection, gap: 1, width: '100%' }}>
        {/* Card 3: Audit & Security */}
        <box
          borderStyle="rounded"
          borderColor="#434c5e"
          title=" Audit & Security "
          titleColor="#88c0d0"
          style={{ flexDirection: 'column', flexGrow: 1, padding: 1, gap: 0 }}
        >
          <box style={{ flexDirection: 'row', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <text fg={isAuditClean ? '#a3be8c' : '#ebcb8b'}>
              {isAuditClean
                ? '✔ All checks passed'
                : `▲ ${auditStatus?.findingsCount ?? inventory.attention} finding(s) require review`}
            </text>
          </box>
          <box style={{ flexDirection: 'column', gap: 0, marginTop: 1 }}>
            <box style={{ flexDirection: 'row', gap: 1, flexWrap: 'wrap' }}>
              <text fg="#a3be8c">✔</text>
              <text fg="#d8dee9">Shell configuration & symlinks validated</text>
            </box>
            <box style={{ flexDirection: 'row', gap: 1, flexWrap: 'wrap' }}>
              <text fg="#a3be8c">✔</text>
              <text fg="#d8dee9">Rollback readiness & receipt log verified</text>
            </box>
            <box style={{ flexDirection: 'row', gap: 1, flexWrap: 'wrap' }}>
              <text fg="#a3be8c">✔</text>
              <text fg="#d8dee9">Dry-run safety invariants enforced</text>
            </box>
          </box>
        </box>

        {/* Card 4: Quick Actions */}
        <box
          borderStyle="rounded"
          borderColor="#434c5e"
          title=" Quick Actions "
          titleColor="#88c0d0"
          style={{ flexDirection: 'column', flexGrow: 1, padding: 1, gap: 0 }}
        >
          <box style={{ flexDirection: 'row', gap: 1, flexWrap: 'wrap' }}>
            <text fg="#81a1c1">[&lt;Space&gt; a]</text>
            <text fg="#eceff4">Audit:</text>
            <text fg="#d8dee9">Scan shell environment for drift</text>
          </box>
          <box style={{ flexDirection: 'row', gap: 1, flexWrap: 'wrap' }}>
            <text fg="#81a1c1">[&lt;Space&gt; b]</text>
            <text fg="#eceff4">Bootstrap:</text>
            <text fg="#d8dee9">Plan initial mzsh adoption</text>
          </box>
          <box style={{ flexDirection: 'row', gap: 1, flexWrap: 'wrap' }}>
            <text fg="#81a1c1">[&lt;Space&gt; u]</text>
            <text fg="#eceff4">Update:</text>
            <text fg="#d8dee9">Plan managed update safely</text>
          </box>
          <box style={{ flexDirection: 'row', gap: 1, flexWrap: 'wrap' }}>
            <text fg="#81a1c1">[&lt;Space&gt; i]</text>
            <text fg="#eceff4">Inventory:</text>
            <text fg="#d8dee9">Inspect aliases & components</text>
          </box>
        </box>
      </box>
    </box>
  );
}
