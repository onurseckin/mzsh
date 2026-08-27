# Only interactive shells activate the portable manifest and its UI integrations.
typeset -g MZSH_PORTABLE_ZSH_LOADER_CONTEXT=interactive
typeset -g MZSH_PORTABLE_ZSH_ROOT="${${(%):-%N}:A:h:h}"

if [[ -o interactive ]]; then
  source "$MZSH_PORTABLE_ZSH_ROOT/init.zsh" || return 1
fi

return 0
