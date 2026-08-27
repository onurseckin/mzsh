# A single prompt hook observes a stamp; history files change only on explicit helper calls.
[[ -o interactive ]] || return 0

typeset -g HISTFILE="${HISTFILE:-$HOME/.zsh_history}"
typeset -g HISTSIZE=10000
typeset -g SAVEHIST=10000
setopt append_history inc_append_history share_history hist_ignore_dups hist_save_no_dups hist_ignore_space

typeset -g _mzsh_history_clean_stamp=${_mzsh_history_clean_stamp:-}

function _mzsh_history_cleaner_precmd_hook() {
  local stamp_file="$HOME/.zsh_history_cleaned"
  [[ -r $stamp_file ]] || return 0
  local current_stamp
  current_stamp=$(<"$stamp_file")
  [[ $current_stamp == "$_mzsh_history_clean_stamp" ]] && return 0
  typeset -g _mzsh_history_clean_stamp="$current_stamp"
  local old_histsize=${HISTSIZE:-10000}
  HISTSIZE=0
  HISTSIZE=$old_histsize
  fc -R "${HISTFILE:-$HOME/.zsh_history}"
}

if (( ! $+functions[add-zsh-hook] )); then
  for mzsh_history_fpath_directory in "${fpath[@]}"; do
    [[ -r $mzsh_history_fpath_directory/add-zsh-hook ]] || continue
    autoload -Uz add-zsh-hook
    break
  done
  unset mzsh_history_fpath_directory
fi
if (( $+functions[add-zsh-hook] )) && [[ " ${precmd_functions[*]:-} " != *" _mzsh_history_cleaner_precmd_hook "* ]]; then
  add-zsh-hook precmd _mzsh_history_cleaner_precmd_hook
fi

function history-cleaner() {
  if (( $# != 1 )); then
    print -u2 -- 'Usage: history-cleaner <regex-pattern>'
    return 1
  fi
  command history-cleaner-helper "$1" "${HISTFILE:-$HOME/.zsh_history}" || return $?
  _mzsh_history_cleaner_precmd_hook
}

function history-reload() {
  local old_histsize=${HISTSIZE:-10000}
  HISTSIZE=0
  HISTSIZE=$old_histsize
  fc -R "${HISTFILE:-$HOME/.zsh_history}"
}

return 0
