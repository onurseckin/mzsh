# Framework configuration is prepared before loading zsh-vi-mode, but a
# missing framework remains a no-op for an otherwise usable interactive shell.
[[ -o interactive ]] || return 0

typeset mzsh_module_directory="${${(%):-%N}:A:h}"
source "$mzsh_module_directory/prompt-vi.zsh" || return 1
typeset mzsh_omz_root="${MZSH_OH_MY_ZSH_ROOT:-$HOME/.oh-my-zsh}"
[[ -r $mzsh_omz_root/oh-my-zsh.sh ]] || { unset mzsh_module_directory mzsh_omz_root; return 0; }

export ZSH="$mzsh_omz_root"
typeset mzsh_cache_root="${XDG_CACHE_HOME:-$HOME/.cache}/mzsh"
(umask 077 && command mkdir -p "$mzsh_cache_root")
export ZSH_COMPDUMP="$mzsh_cache_root/zcompdump-${ZSH_VERSION}"
typeset -g ZSH_THEME="${MZSH_OH_MY_ZSH_THEME:-powerlevel10k/powerlevel10k}"
zstyle :omz:plugins:ssh-agent identities id_rsa id_ed25519
zstyle :omz:plugins:ssh-agent lifetime 24h
zstyle :omz:plugins:ssh-agent lazy yes
zstyle :omz:plugins:ssh-agent quiet yes
export ZSH_TMUX_CONFIG="$HOME/.tmux.conf"

typeset -a mzsh_requested_plugins mzsh_available_plugins
mzsh_requested_plugins=(aliases alias-finder aws brew bun colored-man-pages colorize command-not-found copyfile copypath docker docker-compose extract gcloud gh git git-auto-fetch history history-substring-search kubectl macos macports minikube nestjs node npm python pip poetry pre-commit postgres redis-cli ssh ssh-agent tmux web-search yarn you-should-use vscode z fzf fzf-tab zsh-autosuggestions zsh-bat zsh-interactive-cd zsh-syntax-highlighting zsh-vi-mode)
mzsh_available_plugins=()
typeset mzsh_custom_plugins="${ZSH_CUSTOM:-$ZSH/custom}/plugins"
for mzsh_plugin in "${mzsh_requested_plugins[@]}"; do
  if [[ -d $ZSH/plugins/$mzsh_plugin || -d $mzsh_custom_plugins/$mzsh_plugin ]]; then
    mzsh_available_plugins+=("$mzsh_plugin")
  fi
done
plugins=("${mzsh_available_plugins[@]}")

typeset mzsh_custom_themes="${ZSH_CUSTOM:-$ZSH/custom}/themes"
if [[ ! -r $ZSH/themes/$ZSH_THEME.zsh-theme && ! -r $ZSH/themes/$ZSH_THEME/$ZSH_THEME:t.zsh-theme && ! -r $mzsh_custom_themes/$ZSH_THEME.zsh-theme && ! -r $mzsh_custom_themes/$ZSH_THEME/$ZSH_THEME:t.zsh-theme ]]; then
  ZSH_THEME=''
fi

source "$ZSH/oh-my-zsh.sh" || {
  unset mzsh_module_directory mzsh_omz_root mzsh_requested_plugins mzsh_available_plugins mzsh_plugin mzsh_custom_plugins mzsh_custom_themes
  return 1
}

if [[ -r "$HOME/.p10k.zsh" ]]; then
  source "$HOME/.p10k.zsh"
fi

typeset -g MZSH_OH_MY_ZSH_LOADED=1
unset mzsh_module_directory mzsh_omz_root mzsh_requested_plugins mzsh_available_plugins mzsh_plugin mzsh_custom_plugins mzsh_custom_themes

return 0
