# Homebrew's prefix is injected by the host or an installer; no architecture
# specific default is assumed here.
if [[ -n ${MZSH_HOMEBREW_PREFIX:-} ]]; then
  mzsh_path_add_application "$MZSH_HOMEBREW_PREFIX/bin"
  mzsh_path_add_application "$MZSH_HOMEBREW_PREFIX/sbin"
fi

return 0
