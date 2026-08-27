# Login shells receive deterministic paths without interactive shell state.
[[ -o login ]] || return 0
typeset -g MZSH_PORTABLE_ZSH_LOADER_CONTEXT=login
typeset -g MZSH_PORTABLE_ZSH_ROOT="${${(%):-%N}:A:h:h}"
source "$MZSH_PORTABLE_ZSH_ROOT/login-manifest.zsh" || return 1
return 0
