#!/usr/bin/env bash

set -eu

printf '%s\n' 'MZSH legacy uninstallation is retired.'
printf '%s\n' 'Run: bun run mzsh -- audit'
printf '%s\n' 'Then: bun run mzsh -- rollback receipt-id'
printf '%s\n' 'Add --apply only after reviewing the rollback dry run.'
exit 2
