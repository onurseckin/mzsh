#!/usr/bin/env bash
# Zsh must stay on its own parser/formatter path: ShellCheck does not support it.
set -euo pipefail

for tool in zsh shfmt shellcheck; do
  command -v "$tool" >/dev/null || {
    printf 'mzsh quality gate requires %s on PATH\n' "$tool" >&2
    exit 127
  }
done

portable_dir="portable"

find "$portable_dir/zsh" -type f -name '*.zsh' -exec zsh -n {} +
test -f "$portable_dir/tmux/.tmux.conf" || {
  printf 'mzsh quality gate requires %s/tmux/.tmux.conf\n' "$portable_dir" >&2
  exit 1
}

shfmt -ln=posix -d "$portable_dir/zsh/shims/shim-runner"
shfmt -ln=bash -d "$portable_dir/zsh/shims/check-prohibited"
shellcheck -s sh "$portable_dir/zsh/shims/shim-runner"
shellcheck -s bash "$portable_dir/zsh/shims/check-prohibited"
