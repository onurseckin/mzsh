# FZF and fzf-tab consume these strings later; sourcing must not search files.
[[ -o interactive ]] || return 0

export FZF_DEFAULT_COMMAND='rg --files --hidden --follow --glob "!.git/*" --glob "!node_modules/*"'
export FZF_DEFAULT_OPTS='--preview '\''bat -n --color=always --line-range :500 {}'\'' --preview-window=right:70%:wrap:hidden --bind '\''ctrl-/:change-preview-window(right|hidden)'\'' --bind '\''enter:execute(${EDITOR:-nvim} {+})+abort'\'' --height 100% --layout=reverse --border'
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_CTRL_R_OPTS='--preview '\''echo {}'\'' --preview-window up:3:hidden:wrap --bind '\''ctrl-/:toggle-preview'\'' --bind '\''ctrl-y:execute-silent(echo -n {2..} | pbcopy)+abort'\'' --color header:italic --header '\''Press CTRL-Y to copy command into clipboard'\'''

zstyle ':completion:*:git-checkout:*' sort false
zstyle ':completion:*:descriptions' format '[%d]'
zstyle ':fzf-tab:complete:(cd|z|ls|eza):*' fzf-preview 'eza -1 --color=always $realpath'
zstyle ':fzf-tab:complete:(-command-|-parameter-|-brace-parameter-|export|unset|expand):*' fzf-preview 'echo ${(P)word}'
zstyle ':fzf-tab:complete:-command-:*' fzf-preview '(out=$(tldr --color always "$word") 2>/dev/null && echo $out) || (out=$(man "$word") 2>/dev/null && echo $out) || (out=$(command -v "$word") && echo $out) || echo "${(P)word}"'
zstyle ':fzf-tab:complete:*:*' fzf-preview 'bat -n --color=always --line-range :500 $realpath'
zstyle ':fzf-tab:*' switch-group '<' '>'
zstyle ':fzf-tab:*' fzf-flags --preview-window=right:60%:wrap:hidden

return 0
