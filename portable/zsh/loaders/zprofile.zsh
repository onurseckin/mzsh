# Login-shell integrations remain explicit so non-login shells stay side-effect free.
typeset -g MZSH_PORTABLE_ZSH_LOADER_CONTEXT=login
typeset -g MZSH_PORTABLE_ZSH_ROOT="${${(%):-%N}:A:h:h}"
return 0
