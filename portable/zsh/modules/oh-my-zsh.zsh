# Oh My Zsh is opt-in so this foundation never reaches into a pre-existing
# shell setup unless the caller explicitly identifies a portable framework.
if [[ -n ${MZSH_OH_MY_ZSH_ROOT:-} && -r $MZSH_OH_MY_ZSH_ROOT/oh-my-zsh.sh ]]; then
  source "$MZSH_OH_MY_ZSH_ROOT/oh-my-zsh.sh" || return 1
  typeset -g MZSH_OH_MY_ZSH_LOADED=1
fi

return 0
