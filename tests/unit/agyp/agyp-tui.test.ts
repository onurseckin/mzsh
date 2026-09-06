import { describe, expect, test } from 'bun:test';
import { AgypTui } from '../../../src/infrastructure/agyp/agyp-tui';
import { fakeIo, modelOf, row, ScriptedController, tick, track } from './agyp-tui-harness';

const ALICE = 'alice@example.com';
const BOB = 'bob@example.com';

function cursorLine(screen: string): string {
  return screen.split('\n').find((line) => line.startsWith('>')) ?? '';
}

describe('AgypTui in-place updates', () => {
  test('refresh redraws on the same terminal and keeps the cursor on the same account', async () => {
    const io = fakeIo();
    const controller = new ScriptedController();
    const menu = track(
      AgypTui.present(modelOf([row(ALICE, 80, { isSession: true }), row(BOB, 40)]), controller, io)
    );
    await tick();
    expect(io.input.rawMode).toBe(true);
    expect(cursorLine(io.output.screen())).toContain(ALICE);

    await io.input.press('j');
    expect(cursorLine(io.output.screen())).toContain(BOB);

    await io.input.press('r');
    expect(controller.received).toEqual([{ kind: 'refresh' }]);
    expect(io.output.screen()).toContain('Refreshing quota');
    expect(io.closeCalls).toBe(0);
    expect(io.input.rawMode).toBe(true);

    // Action keys wait for the update; the menu must not answer with stale rows.
    await io.input.press('\r');
    expect(menu.settled()).toBe(false);
    await io.input.press('r');
    expect(controller.received).toHaveLength(1);

    await controller.answer(modelOf([row(BOB, 12), row(ALICE, 77, { isSession: true })], 'Done.'));
    const screen = io.output.screen();
    expect(screen).toContain('Done.');
    expect(screen).toContain('77%');
    expect(screen).toContain('12%');
    expect(cursorLine(screen)).toContain(BOB);
    expect(io.closeCalls).toBe(0);

    await io.input.press('\r');
    expect(await menu.value()).toEqual({ kind: 'use', email: BOB });
    expect(io.closeCalls).toBe(1);
    expect(io.input.rawMode).toBe(false);
  });

  test('quitting during an update leaves at once and never draws on the closed terminal', async () => {
    const io = fakeIo();
    const controller = new ScriptedController();
    const menu = track(AgypTui.present(modelOf([row(ALICE, 80)]), controller, io));
    await tick();

    await io.input.press('r');
    expect(controller.inFlight).toBe(true);
    await io.input.press('q');
    expect(await menu.value()).toEqual({ kind: 'cancel' });
    expect(io.closeCalls).toBe(1);

    const framesAfterClose = io.output.frames.length;
    await controller.answer(modelOf([row(ALICE, 5)]));
    expect(io.output.frames).toHaveLength(framesAfterClose);
    expect(io.closeCalls).toBe(1);
  });

  test('navigation still works while an update is in flight', async () => {
    const io = fakeIo();
    const controller = new ScriptedController();
    const menu = track(AgypTui.present(modelOf([row(ALICE, 80), row(BOB, 40)]), controller, io));
    await tick();

    await io.input.press('r');
    await io.input.press('2');
    expect(cursorLine(io.output.screen())).toContain(BOB);
    expect(io.output.screen()).toContain('Refreshing quota');

    await controller.answer(modelOf([row(ALICE, 80), row(BOB, 40)]));
    await io.input.press('\r');
    expect(await menu.value()).toEqual({ kind: 'use', email: BOB });
  });

  test('a failed update reports in the notice line and keeps the menu open', async () => {
    const io = fakeIo();
    const controller = new ScriptedController();
    const menu = track(AgypTui.present(modelOf([row(ALICE, 80)]), controller, io));
    await tick();

    await io.input.press('r');
    await controller.fail('probe exploded');
    expect(io.output.screen()).toContain('refresh failed: probe exploded');
    expect(menu.settled()).toBe(false);
    expect(io.closeCalls).toBe(0);

    await io.input.press('q');
    expect(await menu.value()).toEqual({ kind: 'cancel' });
  });

  test('global and remove are served in place for the highlighted account', async () => {
    const io = fakeIo();
    const controller = new ScriptedController();
    const menu = track(AgypTui.present(modelOf([row(ALICE, 80), row(BOB, 40)]), controller, io));
    await tick();

    await io.input.press('g');
    expect(controller.received).toEqual([{ kind: 'global', email: ALICE }]);
    expect(io.output.screen()).toContain(`Making ${ALICE} the global default`);
    await controller.answer(modelOf([row(ALICE, 80, { isGlobal: true }), row(BOB, 40)]));
    expect(io.output.screen()).toContain(`global        ${ALICE}`);

    await io.input.press('j');
    await io.input.press('x');
    expect(controller.received[1]).toEqual({ kind: 'remove', email: BOB });
    await controller.answer(modelOf([row(ALICE, 80, { isGlobal: true })], 'Removed.'));
    expect(io.output.screen()).not.toContain(BOB);
    expect(cursorLine(io.output.screen())).toContain(ALICE);

    await io.input.press('x');
    await controller.answer(modelOf([], 'Removed.'));
    expect(io.output.screen()).toContain('No accounts yet');
    await io.input.press('\r');
    expect(await menu.value()).toEqual({ kind: 'cancel' });
  });

  test('sign-in leaves the menu because it needs the terminal itself', async () => {
    const io = fakeIo();
    const controller = new ScriptedController();
    const menu = track(AgypTui.present(modelOf([]), controller, io));
    await tick();
    await io.input.press('n');
    expect(await menu.value()).toEqual({ kind: 'login' });
    expect(controller.received).toEqual([]);
    expect(io.closeCalls).toBe(1);
  });

  test('a terminal error closes the menu instead of crashing', async () => {
    const io = fakeIo();
    const controller = new ScriptedController();
    const menu = track(AgypTui.present(modelOf([row(ALICE, 80)]), controller, io));
    await tick();
    io.output.emit('error', new Error('EIO'));
    expect(await menu.value()).toEqual({ kind: 'cancel' });
    expect(io.closeCalls).toBe(1);
  });
});
