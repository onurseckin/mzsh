# This all-shell loader deliberately avoids plugins, prompts, and private data.
typeset -g MZSH_PORTABLE_ZSH_LOADER_CONTEXT=all-shell
typeset -g MZSH_PORTABLE_ZSH_ROOT="${${(%):-%N}:A:h:h}"
return 0
