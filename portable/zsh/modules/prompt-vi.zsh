# Vi-mode must be configured before the optional framework loads its plugin.
[[ -o interactive ]] || return 0

typeset -g ZVM_INIT_MODE=sourcing
typeset -g ZVM_LINE_INIT_MODE=${ZVM_MODE_INSERT:-i}
typeset -g ZVM_INSERT_MODE_CURSOR=${ZVM_CURSOR_BEAM:-beam}
typeset -g ZVM_NORMAL_MODE_CURSOR=${ZVM_CURSOR_BLOCK:-block}
typeset -g ZVM_VISUAL_MODE_CURSOR=${ZVM_CURSOR_BLOCK:-block}
typeset -g ZVM_OPPEND_MODE_CURSOR=${ZVM_CURSOR_UNDERLINE:-underline}
typeset -g ZVM_VI_HIGHLIGHT_FOREGROUND=black
typeset -g ZVM_VI_HIGHLIGHT_BACKGROUND='#7aa2f7'
typeset -g ZVM_SYSTEM_CLIPBOARD_ENABLED=true

if (( ! ${+functions[zvm_after_init]} )); then
  function zvm_after_init() {
    bindkey -M viins '^A' beginning-of-line
    bindkey -M viins '^E' end-of-line
    bindkey -M viins '^W' backward-kill-word
    bindkey -M viins '^U' backward-kill-line
    bindkey -M viins '^K' kill-line
    bindkey -M viins '^[b' backward-word
    bindkey -M viins '^[f' forward-word

    if (( ${+functions[history-substring-search-up]} )); then
      bindkey -M viins '^[[A' history-substring-search-up
      bindkey -M viins '^[[B' history-substring-search-down
      bindkey -M vicmd 'k' history-substring-search-up
      bindkey -M vicmd 'j' history-substring-search-down
    fi
  }
fi

return 0
