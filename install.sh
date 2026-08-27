#!/usr/bin/env bash

set -eu

printf '%s\n' 'MZSH legacy installation is retired.'
printf '%s\n' 'Run: bun run mzsh -- audit'
printf '%s\n' 'Then: bun run mzsh -- bootstrap --source /absolute/mzsh-checkout'
printf '%s\n' 'Add --apply only after reviewing the dry-run plan.'
exit 2
