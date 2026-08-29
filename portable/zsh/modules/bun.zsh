typeset mzsh_bun_install="${BUN_INSTALL:-$HOME/.bun}"
mzsh_path_add_application "$mzsh_bun_install/bin"
unset mzsh_bun_install
return 0
