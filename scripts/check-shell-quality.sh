#!/usr/bin/env bash
# Zsh must stay on its own parser/formatter path: ShellCheck does not support it.
set -euo pipefail

for tool in zsh shfmt shellcheck; do
  command -v "$tool" >/dev/null || {
    printf 'mzsh quality gate requires %s on PATH\n' "$tool" >&2
    exit 127
  }
done

find portable/zsh -type f -name '*.zsh' -exec zsh -n {} +

shfmt -ln=posix -d portable/zsh/shims/shim-runner
shfmt -ln=bash -d portable/zsh/shims/check-prohibited
shellcheck -s sh portable/zsh/shims/shim-runner
shellcheck -s bash portable/zsh/shims/check-prohibited
