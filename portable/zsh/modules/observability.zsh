# Diagnostics are opt-in so sourcing the foundation stays quiet for scripts.
function mzsh_observe() {
  [[ ${MZSH_OBSERVE:-} == 1 ]] || return 0
  print -u2 -r -- "mzsh: $*"
}
