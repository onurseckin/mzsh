# Interactive conveniences remain definitions only; the commands run on use.
[[ -o interactive ]] || return 0

alias rm='rmtrash'
alias del='rmtrash'
alias y='yazi'
alias ls='eza -a --icons=always --color=auto --group-directories-first'
alias tree='eza -a --tree --icons=always --color=auto --group-directories-first --git-ignore'
alias weztermlua='open -a Antigravity "$HOME/.wezterm.lua"'
alias vim='nvim'
alias vi='nvim'
alias tldrconfig='nvim "$HOME/Library/Application Support/tealdeer/config.toml"'
alias h='history -i -r 1 | less'
alias reap='reap-zombies'

function n() {
  if (( $# == 0 )); then
    command nvim .
  else
    command nvim "$@"
  fi
}

return 0
