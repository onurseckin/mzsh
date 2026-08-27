# Bun's documented install root is portable across user accounts.
[[ -n ${BUN_INSTALL:-} ]] && mzsh_path_add_application "$BUN_INSTALL/bin"
return 0
