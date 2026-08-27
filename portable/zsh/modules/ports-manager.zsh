# Process inspection and termination are explicit user actions, never startup behavior.
[[ -o interactive ]] || return 0

function _mzsh_ports_kill() {
  if [[ -n ${MZSH_PORTS_KILL_RUNNER:-} ]]; then
    [[ $MZSH_PORTS_KILL_RUNNER == /* && -x $MZSH_PORTS_KILL_RUNNER ]] || {
      print -u2 -- 'kk: configured kill runner is unsafe or unavailable'
      return 1
    }
    "$MZSH_PORTS_KILL_RUNNER" -- "$@"
    return $?
  fi
  command kill -9 "$@"
}

function kk() {
  if (( $# != 1 )) || [[ $1 != <-> ]] || (( $1 < 1 || $1 > 65535 )); then
    print -u2 -- 'Usage: kk <port 1-65535>'
    return 1
  fi
  local -a pids
  pids=("${(@f)$(command lsof -nP -ti ":$1" 2>/dev/null)}")
  pids=("${(@)pids:#}")
  (( ${#pids[@]} > 0 )) || return 0
  local pid
  for pid in "${pids[@]}"; do
    [[ $pid == <-> ]] || { print -u2 -- 'kk: refusing invalid process identifier'; return 1; }
  done
  _mzsh_ports_kill "${pids[@]}"
}

function kka() {
  if (( $# != 1 )) || [[ -z $1 || $1 == -* || $1 == *$'\n'* ]]; then
    print -u2 -- 'Usage: kka <process-name>'
    return 1
  fi
  local -a pids remaining
  pids=("${(@f)$(command pgrep -fi "$1" 2>/dev/null)}")
  pids=("${(@)pids:#}")
  (( ${#pids[@]} > 0 )) || { print -r -- 'No matching processes found.'; return 0; }
  local pid
  for pid in "${pids[@]}"; do
    [[ $pid == <-> ]] || { print -u2 -- 'kka: refusing invalid process identifier'; return 1; }
  done
  command ps -p "${pids[@]}" -o pid,ppid,comm 2>/dev/null
  for pid in "${pids[@]}"; do command pkill -9 -P "$pid" 2>/dev/null; done
  _mzsh_ports_kill "${pids[@]}"
  remaining=("${(@f)$(command pgrep -fi "$1" 2>/dev/null)}")
  (( ${#remaining[@]} == 0 )) && print -r -- 'Matching processes terminated.' || print -u2 -- 'Some matching processes remain.'
}

return 0
