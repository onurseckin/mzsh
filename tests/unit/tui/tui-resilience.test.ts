import { describe, expect, it } from 'bun:test';
import { createTuiLauncher, runTui } from '../../../src/tui/create-tui';
import { resolveViewportProfile } from '../../../src/tui/viewport';
import {
  ANSI_CURSOR_SHOW,
  ANSI_EXIT_ALT_SCREEN,
  ANSI_RESET_FORMAT,
  restoreTerminalState,
} from '../../../src/infrastructure/terminal-cleanup';
import type { TuiState } from '../../../src/tui/types';

const defaultState: TuiState = {
  screen: 'dashboard',
  inventory: { healthy: 10, attention: 0 },
  history: [],
};

describe('TUI Signal Trap and Terminal Resilience', () => {
  it('guards runTui against execution in non-TTY piped streams without throwing', async () => {
    let errorThrown = false;
    try {
      await runTui({
        state: () => defaultState,
        isTTY: false,
      });
    } catch {
      errorThrown = true;
    }
    expect(errorThrown).toBe(false);
  });

  it('provides a launcher that delegates to runTui safely', () => {
    const launcher = createTuiLauncher({
      state: () => defaultState,
      isTTY: false,
    });
    expect(typeof launcher.launch).toBe('function');
    expect(() => launcher.launch()).not.toThrow();
  });

  it('resolves viewport profiles safely on extreme or boundary dimensions', () => {
    // 0x0 boundary
    const zeroProfile = resolveViewportProfile({ columns: 0, rows: 0, width: 0, height: 0 });
    expect(zeroProfile.name).toBe('mobile-compact');
    expect(zeroProfile.isMobile).toBe(true);

    // Large desktop boundary
    const largeProfile = resolveViewportProfile({ columns: 300, rows: 80 });
    expect(largeProfile.name).toBe('large-desktop');
    expect(largeProfile.isCompact).toBe(false);

    // Split-pane boundary
    const tabletProfile = resolveViewportProfile({ columns: 80, rows: 40 });
    expect(tabletProfile.name).toBe('tablet-split');
    expect(tabletProfile.isCompact).toBe(true);
  });

  it('restores terminal formatting, cursor, and alternate screen unconditionally', () => {
    let captured = '';
    const mockOutput = {
      write: (data: string | Uint8Array) => {
        captured += String(data);
        return true;
      },
    };

    restoreTerminalState({ output: mockOutput });
    expect(captured).toContain(ANSI_CURSOR_SHOW);
    expect(captured).toContain(ANSI_EXIT_ALT_SCREEN);
    expect(captured).toContain(ANSI_RESET_FORMAT);
  });
});
