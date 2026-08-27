import { expect, test } from 'bun:test';
import { createOpenInvocation } from '../src/openConfig';

test('passes terminal editor paths as one argv element without shell execution', () => {
  const path = '/safe directory/config;not-a-command.zsh';

  expect(createOpenInvocation(path, 'vim', 'linux')).toEqual({
    command: 'vim',
    args: [path],
    options: { detached: false, stdio: 'inherit' },
    waitForExit: true,
  });
});

test('uses detached GUI invocations without the Windows shell start builtin', () => {
  const path = 'C:\\safe directory\\config & notes.zsh';

  expect(createOpenInvocation(path, 'default', 'win32')).toEqual({
    command: 'explorer.exe',
    args: [path],
    options: { detached: true, stdio: 'ignore' },
    waitForExit: false,
  });
});
