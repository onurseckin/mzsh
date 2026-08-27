#!/usr/bin/env bash

# Legacy shell scripts intentionally stop before mutating a machine. Keep one
# fixed migration vocabulary so callers cannot be steered toward global removal.
managed_lifecycle_notice() {
    local operation="$1"

    printf '%s\n' "MZSH legacy ${operation} is retired."
    printf '%s\n' 'Run: bun run mzsh -- audit'
    case "$operation" in
        installation)
            printf '%s\n' 'Then: bun run mzsh -- bootstrap --source /absolute/mzsh-checkout'
            ;;
        update)
            printf '%s\n' 'Then: bun run mzsh -- update --source /absolute/mzsh-checkout'
            ;;
        uninstallation)
            printf '%s\n' 'Then: bun run mzsh -- rollback receipt-id'
            ;;
    esac
    printf '%s\n' 'Capture reviewedPlanId from dry output, then use --apply --plan-id reviewed-plan-id --confirm APPLY.'
}

install_info_starting() {
    managed_lifecycle_notice installation
}

uninstall_info_starting() {
    managed_lifecycle_notice uninstallation
}
