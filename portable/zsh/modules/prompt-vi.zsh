# Vi-mode must be configured before the optional framework loads its plugin.
[[ -o interactive ]] || return 0

# Fast escape timeout for vi mode (1 centisecond = 10ms) to eliminate escape delay
typeset -gi KEYTIMEOUT=1

typeset -g ZVM_INIT_MODE=sourcing
typeset -g ZVM_LINE_INIT_MODE=${ZVM_MODE_INSERT:-i}
typeset -g ZVM_INSERT_MODE_CURSOR=${ZVM_CURSOR_BEAM:-beam}
typeset -g ZVM_NORMAL_MODE_CURSOR=${ZVM_CURSOR_BLOCK:-block}
typeset -g ZVM_VISUAL_MODE_CURSOR=${ZVM_CURSOR_BLOCK:-block}
typeset -g ZVM_OPPEND_MODE_CURSOR=${ZVM_CURSOR_UNDERLINE:-underline}
typeset -g ZVM_VI_HIGHLIGHT_FOREGROUND=black
typeset -g ZVM_VI_HIGHLIGHT_BACKGROUND='#7aa2f7'
typeset -g ZVM_SYSTEM_CLIPBOARD_ENABLED=true

# Enable bracketed paste mode protections for safe paste / voice dictation bursts
autoload -Uz bracketed-paste-magic 2>/dev/null && zle -N bracketed-paste bracketed-paste-magic 2>/dev/null || true

if (( ! ${+functions[zvm_after_init]} )); then
  function zvm_after_init() {
    bindkey -M viins '^A' beginning-of-line
    bindkey -M viins '^E' end-of-line
    bindkey -M viins '^W' backward-kill-word
    bindkey -M viins '^U' backward-kill-line
    bindkey -M viins '^K' kill-line
    bindkey -M viins '^[b' backward-word
    bindkey -M viins '^[f' forward-word
    bindkey -M viins '^?' backward-delete-char
    bindkey -M viins '^H' backward-delete-char
    bindkey -M viins '^D' delete-char-or-list
    bindkey -M viins '^Y' yank
    bindkey -M viins '^_' undo

    bindkey -M vicmd '^A' beginning-of-line
    bindkey -M vicmd '^E' end-of-line
    bindkey -M vicmd 'u' undo
    bindkey -M vicmd '^R' redo

    if (( ${+widgets[bracketed-paste]} )); then
      bindkey -M viins '^[[200~' bracketed-paste 2>/dev/null || true
      bindkey -M vicmd '^[[200~' bracketed-paste 2>/dev/null || true
    fi

    if (( ${+functions[history-substring-search-up]} )); then
      bindkey -M viins '^[[A' history-substring-search-up
      bindkey -M viins '^[[B' history-substring-search-down
      bindkey -M vicmd 'k' history-substring-search-up
      bindkey -M vicmd 'j' history-substring-search-down
    fi
  }
fi

return 0

