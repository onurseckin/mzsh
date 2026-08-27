# Prefer MZSH's explicit configuration, then Homebrew's standard environment
# export. This avoids an architecture default and never invokes Homebrew.
typeset -g MZSH_HOMEBREW_EFFECTIVE_PREFIX="${MZSH_HOMEBREW_PREFIX:-${HOMEBREW_PREFIX:-}}"
if [[ -n $MZSH_HOMEBREW_EFFECTIVE_PREFIX ]]; then
  mzsh_path_add_application "$MZSH_HOMEBREW_EFFECTIVE_PREFIX/bin"
  mzsh_path_add_application "$MZSH_HOMEBREW_EFFECTIVE_PREFIX/sbin"
fi

return 0
