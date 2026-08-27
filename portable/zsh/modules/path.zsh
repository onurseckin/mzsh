# PATH is assembled once at the end so that duplicate removal cannot change
# the explicit module order or let a later machine-specific export win.
typeset -ga MZSH_PATH_SHIMS=()
typeset -ga MZSH_PATH_RUNTIMES=()
typeset -ga MZSH_PATH_APPLICATIONS=()

function mzsh_path_add_shim() {
  emulate -L zsh
  [[ $# -eq 1 && -d $1 ]] || return 0
  MZSH_PATH_SHIMS+=("$1")
}

function mzsh_path_add_application() {
  emulate -L zsh
  [[ $# -eq 1 && -d $1 ]] || return 0
  MZSH_PATH_APPLICATIONS+=("$1")
}

function mzsh_path_add_runtime() {
  emulate -L zsh
  [[ $# -eq 1 && -d $1 ]] || return 0
  MZSH_PATH_RUNTIMES+=("$1")
}

function mzsh_path_canonicalize() {
  emulate -L zsh
  local candidate="$1"

  if [[ $candidate == /* && -d $candidate ]]; then
    print -r -- "${candidate:A}"
    return 0
  fi

  while [[ $candidate != / && $candidate == */ ]]; do
    candidate="${candidate%/}"
  done
  print -r -- "$candidate"
}

function mzsh_path_finalize() {
  emulate -L zsh
  typeset -A seen=()
  typeset -a candidates=()
  typeset -a deduplicated=()
  local candidate mzsh_path_identity mzsh_path_display mzsh_path_index
  local mzsh_path_shim_count=${#MZSH_PATH_SHIMS[@]}
  local mzsh_path_runtime_count=${#MZSH_PATH_RUNTIMES[@]}

  candidates=(
    "${MZSH_PATH_SHIMS[@]}"
    "${MZSH_PATH_RUNTIMES[@]}"
    "${MZSH_PATH_APPLICATIONS[@]}"
    "${(@s/:/)PATH}"
  )

  for (( mzsh_path_index = 1; mzsh_path_index <= ${#candidates[@]}; ++mzsh_path_index )); do
    candidate="${candidates[$mzsh_path_index]}"
    mzsh_path_identity="$(mzsh_path_canonicalize "$candidate")"
    [[ -n $mzsh_path_identity && -z ${seen[$mzsh_path_identity]:-} ]] || continue
    seen[$mzsh_path_identity]=1
    if ((
      mzsh_path_index > mzsh_path_shim_count &&
        mzsh_path_index <= mzsh_path_shim_count + mzsh_path_runtime_count
    )); then
      mzsh_path_display="${candidate:a}"
    else
      mzsh_path_display="$mzsh_path_identity"
    fi
    deduplicated+=("$mzsh_path_display")
  done

  PATH="${(j.:.)deduplicated}"
  export PATH
  return 0
}

[[ -n ${MZSH_COMMAND_SHIM_DIR:-} ]] && mzsh_path_add_shim "$MZSH_COMMAND_SHIM_DIR"
return 0
