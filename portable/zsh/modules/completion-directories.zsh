# Frameworks may initialize completion while they load, so all external fpath
# entries must exist before the framework boundary.
function mzsh_completion_add_directory() {
  emulate -L zsh
  [[ $# -eq 1 && -d $1 ]] || return 0
  (( ${fpath[(Ie)$1]} )) || fpath+=("$1")
}

[[ -n ${MZSH_HOMEBREW_PREFIX:-} ]] && \
  mzsh_completion_add_directory "$MZSH_HOMEBREW_PREFIX/share/zsh/site-functions"
[[ -n ${MZSH_DOCKER_COMPLETION_DIR:-} ]] && \
  mzsh_completion_add_directory "$MZSH_DOCKER_COMPLETION_DIR"

return 0
