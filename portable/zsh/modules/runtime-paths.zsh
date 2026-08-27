# Runtime choices are data-only symlink entries owned by the host. This module
# reads neither their contents nor a package-manager-specific runtime name.
function mzsh_runtime_directory_mode() {
  command stat -f '%Lp' "$1" 2>/dev/null || command stat -c '%a' "$1" 2>/dev/null
}

function mzsh_runtime_directory_owner() {
  command stat -f '%u' "$1" 2>/dev/null || command stat -c '%u' "$1" 2>/dev/null
}

function mzsh_runtime_add_directory_entries() {
  emulate -L zsh
  local runtime_directory="${MZSH_RUNTIME_PATHS_DIRECTORY:-${XDG_CONFIG_HOME:-$HOME/.config}/mzsh/runtime-paths}"
  local mode owner entry candidate
  [[ -d $runtime_directory && ! -L $runtime_directory ]] || {
    [[ -e $runtime_directory || -L $runtime_directory ]] && \
      mzsh_observe "skipped insecure runtime paths directory"
    return 0
  }
  mode="$(mzsh_runtime_directory_mode "$runtime_directory")"
  owner="$(mzsh_runtime_directory_owner "$runtime_directory")"
  if [[ ! $mode =~ '^[0-7]{3,4}$' ]] || [[ $owner != $EUID ]] || (( 8#$mode != 8#700 )); then
    mzsh_observe "skipped insecure runtime paths directory"
    return 0
  fi
  for entry in python ruby go postgresql java pnpm; do
    candidate="$runtime_directory/$entry"
    [[ -L $candidate && -d $candidate ]] || continue
    mzsh_path_add_runtime "$candidate"
  done
  return 0
}

mzsh_runtime_add_directory_entries
typeset mzsh_runtime_directory_status=$?
unset -f mzsh_runtime_directory_mode mzsh_runtime_directory_owner
unset -f mzsh_runtime_add_directory_entries
(( mzsh_runtime_directory_status == 0 )) || return 1

unset mzsh_runtime_directory_status
return 0
