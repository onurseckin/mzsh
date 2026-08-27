# Completion has one owner. Framework-managed shells keep the framework owner;
# otherwise MZSH initializes once with a private cache directory.
function mzsh_completion_initialize() {
  emulate -L zsh
  [[ ${MZSH_COMPLETION_INITIALIZED:-} == 1 ]] && return 0

  if [[ ${MZSH_OH_MY_ZSH_LOADED:-} == 1 ]]; then
    typeset -g MZSH_COMPLETION_OWNER=oh-my-zsh
    typeset -g MZSH_COMPLETION_INITIALIZED=1
    return 0
  fi

  local cache_root="${XDG_CACHE_HOME:-$HOME/.cache}/mzsh"
  (umask 077 && command mkdir -p "$cache_root") || return 1
  command chmod 700 "$cache_root" 2>/dev/null || return 1

  (( $+functions[compinit] )) || autoload -Uz compinit
  compinit -d "$cache_root/zcompdump-${ZSH_VERSION}" || return 1

  typeset -g MZSH_COMPLETION_OWNER=mzsh
  typeset -g MZSH_COMPLETION_INITIALIZED=1
}

mzsh_completion_initialize || return 1
unset -f mzsh_completion_add_directory mzsh_completion_initialize
return 0
