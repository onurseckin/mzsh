import * as React from 'react';

export function ConfigScreen({ openType }: { openType?: string }) {
  return (
    <box>
      <text>Config Screen {openType}</text>
    </box>
  );
}
