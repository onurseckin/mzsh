# FZF and fzf-tab consume these strings later; sourcing must not search files.
[[ -o interactive ]] || return 0

export FZF_DEFAULT_COMMAND='rg --files --hidden --follow --glob "!.git/*" --glob "!node_modules/*"'
export FZF_DEFAULT_OPTS='--preview '\''bat -n --color=always --line-range :500 {}'\'' --preview-window=right:70%:wrap:hidden --bind '\''ctrl-/:change-preview-window(right|hidden)'\'' --bind '\''enter:execute(${EDITOR:-nvim} {+})+abort'\'' --height 100% --layout=reverse --border'
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_CTRL_R_OPTS='--preview '\''echo {}'\'' --preview-window up:3:hidden:wrap --bind '\''ctrl-/:toggle-preview'\'' --bind '\''ctrl-y:execute-silent(echo -n {2..} | pbcopy)+abort'\'' --color header:italic --header '\''Press CTRL-Y to copy command into clipboard'\'''

# Do not use `fzf --zsh`: that emits shell text for eval. A caller may opt in
# to two inspected static files from a trusted local FZF installation instead.
function mzsh_fzf_source_static_file() {
  emulate -L zsh
  [[ $# -eq 1 && -r $1 && -f $1 && ! -L $1 ]] || return 0
  source "$1" || return 0
}

if [[ -n ${MZSH_FZF_SHELL_DIR:-} && -d $MZSH_FZF_SHELL_DIR && ! -L $MZSH_FZF_SHELL_DIR ]]; then
  mzsh_fzf_source_static_file "$MZSH_FZF_SHELL_DIR/key-bindings.zsh"
  mzsh_fzf_source_static_file "$MZSH_FZF_SHELL_DIR/completion.zsh"
fi
unset -f mzsh_fzf_source_static_file

zstyle ':completion:*:git-checkout:*' sort false
zstyle ':completion:*:descriptions' format '[%d]'
zstyle ':fzf-tab:complete:(cd|z|ls|eza):*' fzf-preview 'eza -1 --color=always $realpath'
zstyle ':fzf-tab:complete:(-command-|-parameter-|-brace-parameter-|export|unset|expand):*' fzf-preview 'echo ${(P)word}'
zstyle ':fzf-tab:complete:-command-:*' fzf-preview '(out=$(tldr --color always "$word") 2>/dev/null && echo $out) || (out=$(man "$word") 2>/dev/null && echo $out) || (out=$(command -v "$word") && echo $out) || echo "${(P)word}"'
zstyle ':fzf-tab:complete:*:*' fzf-preview 'bat -n --color=always --line-range :500 $realpath'
zstyle ':fzf-tab:*' switch-group '<' '>'
zstyle ':fzf-tab:*' fzf-flags --preview-window=right:60%:wrap:hidden

return 0
