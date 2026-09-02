import type { TuiViewModel } from '../types';

export interface HelpOverlayProps {
  readonly viewModel: TuiViewModel;
}

export function HelpOverlay({ viewModel }: HelpOverlayProps): React.ReactNode {
  const { viewport } = viewModel;
  const isCompact = viewport.isCompact;
  const keyPad = isCompact ? 16 : 22;

  const navigationShortcuts = viewModel.shortcuts.filter(
    (shortcut) => shortcut.category === 'Navigation'
  );
  const actionShortcuts = viewModel.shortcuts.filter((shortcut) => shortcut.category === 'Actions');
  const globalShortcuts = viewModel.shortcuts.filter((shortcut) => shortcut.category === 'Global');

  return (
    <box
      borderStyle="rounded"
      borderColor="#88c0d0"
      title=" MZSH Keyboard Navigation & Shortcuts Guide "
      titleColor="#88c0d0"
      style={{
        flexDirection: 'column',
        padding: 1,
        gap: 1,
        width: '100%',
      }}
    >
      <box style={{ flexDirection: 'row', gap: 1, flexWrap: 'wrap' }}>
        <text fg="#81a1c1">{`Leader key is: [${viewModel.leader}] (press space followed by target action)`}</text>
      </box>

      <box style={{ flexDirection: 'column', gap: 0, marginTop: 1 }}>
        <text fg="#ebcb8b">Navigation Shortcuts</text>
        {navigationShortcuts.map((shortcut) => (
          <box key={shortcut.key} style={{ flexDirection: 'row', gap: 2, flexWrap: 'wrap' }}>
            <text fg="#eceff4">{shortcut.key.padEnd(keyPad, ' ')}</text>
            <text fg="#d8dee9">{shortcut.description}</text>
          </box>
        ))}
      </box>

      <box style={{ flexDirection: 'column', gap: 0, marginTop: 1 }}>
        <text fg="#ebcb8b">Actions & Environment</text>
        {actionShortcuts.map((shortcut) => (
          <box key={shortcut.key} style={{ flexDirection: 'row', gap: 2, flexWrap: 'wrap' }}>
            <text fg="#eceff4">{shortcut.key.padEnd(keyPad, ' ')}</text>
            <text fg="#d8dee9">{shortcut.description}</text>
          </box>
        ))}
      </box>

      <box style={{ flexDirection: 'column', gap: 0, marginTop: 1 }}>
        <text fg="#ebcb8b">Global Controls</text>
        {globalShortcuts.map((shortcut) => (
          <box key={shortcut.key} style={{ flexDirection: 'row', gap: 2, flexWrap: 'wrap' }}>
            <text fg="#eceff4">{shortcut.key.padEnd(keyPad, ' ')}</text>
            <text fg="#d8dee9">{shortcut.description}</text>
          </box>
        ))}
      </box>

      <box
        style={{ marginTop: 1, flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' }}
      >
        <text fg="#81a1c1">Press [Esc], [q], [Enter], or [?] to close this help guide</text>
      </box>
    </box>
  );
}
