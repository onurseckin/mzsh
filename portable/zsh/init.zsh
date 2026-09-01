# Source this file from a shell profile. It is self-contained and never reads a
# machine's existing Zsh configuration.
if [[ -n ${MZSH_PORTABLE_ZSH_INITIALIZED:-} ]]; then
  return 0
fi

# The managed surface contains scalars and indexed arrays only. Keep their
# snapshots separate so rollback restores data without evaluating shell text.
typeset -a mzsh_init_owned_scalar_variables=(
  MZSH_PORTABLE_ZSH_INITIALIZED MZSH_PORTABLE_ZSH_VERSION
  MZSH_COMPLETION_OWNER MZSH_COMPLETION_INITIALIZED MZSH_OH_MY_ZSH_LOADED MZSH_NVM_POLICY
  MZSH_HOMEBREW_EFFECTIVE_PREFIX
  ZSH ZSH_THEME ZSH_TMUX_CONFIG
  KEYTIMEOUT
  ZVM_INIT_MODE ZVM_LINE_INIT_MODE ZVM_INSERT_MODE_CURSOR ZVM_NORMAL_MODE_CURSOR
  ZVM_VISUAL_MODE_CURSOR ZVM_OPPEND_MODE_CURSOR ZVM_VI_HIGHLIGHT_FOREGROUND
  ZVM_VI_HIGHLIGHT_BACKGROUND ZVM_SYSTEM_CLIPBOARD_ENABLED
  FZF_DEFAULT_COMMAND FZF_DEFAULT_OPTS FZF_CTRL_T_COMMAND FZF_CTRL_T_OPTS
  FZF_CTRL_R_OPTS
  HISTFILE HISTSIZE SAVEHIST _mzsh_history_clean_stamp
)
typeset -a mzsh_init_owned_array_variables=(
  MZSH_LOADED_MODULES MZSH_PATH_SHIMS MZSH_PATH_RUNTIMES MZSH_PATH_APPLICATIONS plugins precmd_functions
)
typeset -a mzsh_init_owned_aliases=(rm del y ls tree weztermlua vim vi tldrconfig h)
typeset -a mzsh_init_owned_functions=(
  mzsh_observe mzsh_path_add_shim mzsh_path_add_runtime mzsh_path_add_application mzsh_path_canonicalize
  mzsh_path_finalize mzsh_completion_add_directory mzsh_completion_initialize
  mzsh_runtime_directory_mode mzsh_runtime_directory_owner mzsh_runtime_add_directory_entries
  mzsh_private_mode mzsh_private_owner zvm_after_init n
  _mzsh_history_cleaner_precmd_hook history-cleaner history-reload
  _mzsh_dburl_decode _mzsh_dburl_sensitive_key dburl _mzsh_ports_kill kk kka
)
typeset -a mzsh_init_style_contexts=(
  ':omz:plugins:ssh-agent' ':omz:plugins:ssh-agent' ':omz:plugins:ssh-agent' ':omz:plugins:ssh-agent'
  ':completion:*:git-checkout:*' ':completion:*:descriptions'
  ':fzf-tab:complete:(cd|z|ls|eza):*'
  ':fzf-tab:complete:(-command-|-parameter-|-brace-parameter-|export|unset|expand):*'
  ':fzf-tab:complete:-command-:*' ':fzf-tab:complete:*:*'
  ':fzf-tab:*' ':fzf-tab:*'
)
typeset -a mzsh_init_style_names=(
  identities lifetime lazy quiet
  sort format
  fzf-preview fzf-preview fzf-preview fzf-preview
  switch-group fzf-flags
)
typeset -a mzsh_init_owned_options=(
  appendhistory incappendhistory sharehistory histignoredups histsavenodups histignorespace
)
typeset -A mzsh_init_prior_scalar_values mzsh_init_prior_scalar_types
typeset -A mzsh_init_prior_array_counts mzsh_init_prior_array_values
typeset -A mzsh_init_prior_aliases mzsh_init_prior_functions
typeset -A mzsh_init_prior_styles mzsh_init_prior_style_counts mzsh_init_prior_style_values
typeset -A mzsh_init_prior_options

for mzsh_init_scalar_variable in "${mzsh_init_owned_scalar_variables[@]}"; do
  (( $+parameters[$mzsh_init_scalar_variable] )) || continue
  mzsh_init_prior_scalar_values[$mzsh_init_scalar_variable]="${(P)mzsh_init_scalar_variable}"
  mzsh_init_prior_scalar_types[$mzsh_init_scalar_variable]="${parameters[$mzsh_init_scalar_variable]}"
done
for mzsh_init_array_variable in "${mzsh_init_owned_array_variables[@]}"; do
  (( $+parameters[$mzsh_init_array_variable] )) || continue
  mzsh_init_array_values=("${(@P)mzsh_init_array_variable}")
  mzsh_init_prior_array_counts[$mzsh_init_array_variable]=${#mzsh_init_array_values[@]}
  for (( mzsh_init_array_value_index = 1; mzsh_init_array_value_index <= ${#mzsh_init_array_values[@]}; ++mzsh_init_array_value_index )); do
    mzsh_init_prior_array_values["$mzsh_init_array_variable,$mzsh_init_array_value_index"]="${mzsh_init_array_values[$mzsh_init_array_value_index]}"
  done
done
for mzsh_init_alias in "${mzsh_init_owned_aliases[@]}"; do
  (( $+aliases[$mzsh_init_alias] )) || continue
  mzsh_init_prior_aliases[$mzsh_init_alias]="${aliases[$mzsh_init_alias]}"
done
for mzsh_init_function in "${mzsh_init_owned_functions[@]}"; do
  (( $+functions[$mzsh_init_function] )) || continue
  mzsh_init_prior_functions[$mzsh_init_function]="${functions[$mzsh_init_function]}"
done
for mzsh_init_option in "${mzsh_init_owned_options[@]}"; do
  mzsh_init_prior_options[$mzsh_init_option]="${options[$mzsh_init_option]}"
done
for (( mzsh_init_style_index = 1; mzsh_init_style_index <= ${#mzsh_init_style_contexts[@]}; ++mzsh_init_style_index )); do
  mzsh_init_style_context="${mzsh_init_style_contexts[$mzsh_init_style_index]}"
  mzsh_init_style_name="${mzsh_init_style_names[$mzsh_init_style_index]}"
  mzsh_init_style_key="$mzsh_init_style_context|$mzsh_init_style_name"
  zstyle -L "$mzsh_init_style_context" "$mzsh_init_style_name" >/dev/null 2>&1 || continue
  mzsh_init_prior_styles[$mzsh_init_style_key]=1
  mzsh_init_style_values=()
  zstyle -a "$mzsh_init_style_context" "$mzsh_init_style_name" mzsh_init_style_values
  mzsh_init_prior_style_counts[$mzsh_init_style_key]=${#mzsh_init_style_values[@]}
  for (( mzsh_init_style_value_index = 1; mzsh_init_style_value_index <= ${#mzsh_init_style_values[@]}; ++mzsh_init_style_value_index )); do
    mzsh_init_prior_style_values["$mzsh_init_style_key|$mzsh_init_style_value_index"]="${mzsh_init_style_values[$mzsh_init_style_value_index]}"
  done
done

typeset mzsh_init_original_path="$PATH"
typeset mzsh_init_had_fpath=${+parameters[fpath]}
typeset -a mzsh_init_original_fpath=("${fpath[@]}")
typeset -g MZSH_PORTABLE_ZSH_INITIALIZED=1
typeset mzsh_portable_zsh_root="${${(%):-%N}:A:h}"
source "$mzsh_portable_zsh_root/manifest.zsh"
typeset mzsh_portable_zsh_status=$?

if (( mzsh_portable_zsh_status != 0 )); then
  PATH="$mzsh_init_original_path"
  export PATH
  if (( mzsh_init_had_fpath )); then
    fpath=("${mzsh_init_original_fpath[@]}")
  else
    unset fpath
  fi

  for mzsh_init_function in "${mzsh_init_owned_functions[@]}"; do
    unset -f "$mzsh_init_function" 2>/dev/null || true
    (( $+mzsh_init_prior_functions[$mzsh_init_function] )) && \
      functions[$mzsh_init_function]="${mzsh_init_prior_functions[$mzsh_init_function]}"
  done
  for mzsh_init_alias in "${mzsh_init_owned_aliases[@]}"; do
    unalias "$mzsh_init_alias" 2>/dev/null || true
    (( $+mzsh_init_prior_aliases[$mzsh_init_alias] )) && \
      aliases[$mzsh_init_alias]="${mzsh_init_prior_aliases[$mzsh_init_alias]}"
  done
  for mzsh_init_scalar_variable in "${mzsh_init_owned_scalar_variables[@]}"; do
    unset "$mzsh_init_scalar_variable"
    (( $+mzsh_init_prior_scalar_values[$mzsh_init_scalar_variable] )) || continue
    if [[ ${mzsh_init_prior_scalar_types[$mzsh_init_scalar_variable]} == *integer* ]]; then
      typeset -gi "$mzsh_init_scalar_variable=${mzsh_init_prior_scalar_values[$mzsh_init_scalar_variable]}"
    else
      typeset -g "$mzsh_init_scalar_variable=${mzsh_init_prior_scalar_values[$mzsh_init_scalar_variable]}"
    fi
    if [[ ${mzsh_init_prior_scalar_types[$mzsh_init_scalar_variable]} == *-export* ]]; then
      export "$mzsh_init_scalar_variable"
    else
      typeset +x "$mzsh_init_scalar_variable"
    fi
  done
  for mzsh_init_array_variable in "${mzsh_init_owned_array_variables[@]}"; do
    unset "$mzsh_init_array_variable"
    (( $+mzsh_init_prior_array_counts[$mzsh_init_array_variable] )) || continue
    typeset -ga "$mzsh_init_array_variable"
    mzsh_init_array_values=()
    for (( mzsh_init_array_value_index = 1; mzsh_init_array_value_index <= ${mzsh_init_prior_array_counts[$mzsh_init_array_variable]}; ++mzsh_init_array_value_index )); do
      mzsh_init_array_values+=("${mzsh_init_prior_array_values["$mzsh_init_array_variable,$mzsh_init_array_value_index"]}")
    done
    set -A "$mzsh_init_array_variable" "${mzsh_init_array_values[@]}"
  done
  for mzsh_init_option in "${mzsh_init_owned_options[@]}"; do
    if [[ ${mzsh_init_prior_options[$mzsh_init_option]} == on ]]; then
      setopt "$mzsh_init_option"
    else
      unsetopt "$mzsh_init_option"
    fi
  done
  for (( mzsh_init_style_index = 1; mzsh_init_style_index <= ${#mzsh_init_style_contexts[@]}; ++mzsh_init_style_index )); do
    mzsh_init_style_context="${mzsh_init_style_contexts[$mzsh_init_style_index]}"
    mzsh_init_style_name="${mzsh_init_style_names[$mzsh_init_style_index]}"
    mzsh_init_style_key="$mzsh_init_style_context|$mzsh_init_style_name"
    zstyle -d "$mzsh_init_style_context" "$mzsh_init_style_name" 2>/dev/null || true
    (( $+mzsh_init_prior_styles[$mzsh_init_style_key] )) || continue
    mzsh_init_style_values=()
    for (( mzsh_init_style_value_index = 1; mzsh_init_style_value_index <= ${mzsh_init_prior_style_counts[$mzsh_init_style_key]}; ++mzsh_init_style_value_index )); do
      mzsh_init_style_values+=("${mzsh_init_prior_style_values["$mzsh_init_style_key|$mzsh_init_style_value_index"]}")
    done
    zstyle "$mzsh_init_style_context" "$mzsh_init_style_name" "${mzsh_init_style_values[@]}"
  done
  unset mzsh_init_original_path mzsh_init_had_fpath mzsh_init_original_fpath
  unset mzsh_init_function mzsh_init_alias mzsh_init_scalar_variable mzsh_init_array_variable mzsh_init_option
  unset mzsh_init_array_values mzsh_init_array_value_index mzsh_init_style_index
  unset mzsh_init_style_context mzsh_init_style_name mzsh_init_style_key mzsh_init_style_values mzsh_init_style_value_index
  unset mzsh_init_owned_scalar_variables mzsh_init_owned_array_variables mzsh_init_owned_aliases mzsh_init_owned_functions
  unset mzsh_init_style_contexts mzsh_init_style_names mzsh_init_owned_options
  unset mzsh_init_prior_scalar_values mzsh_init_prior_scalar_types mzsh_init_prior_array_counts mzsh_init_prior_array_values
  unset mzsh_init_prior_aliases mzsh_init_prior_functions mzsh_init_prior_styles
  unset mzsh_init_prior_style_counts mzsh_init_prior_style_values mzsh_init_prior_options
  unset mzsh_portable_zsh_root mzsh_portable_zsh_status
  return 1
fi

unset mzsh_init_original_path mzsh_init_had_fpath mzsh_init_original_fpath
unset mzsh_init_function mzsh_init_alias mzsh_init_scalar_variable mzsh_init_array_variable mzsh_init_option
unset mzsh_init_array_values mzsh_init_array_value_index mzsh_init_style_index
unset mzsh_init_style_context mzsh_init_style_name mzsh_init_style_key mzsh_init_style_values mzsh_init_style_value_index
unset mzsh_init_owned_scalar_variables mzsh_init_owned_array_variables mzsh_init_owned_aliases mzsh_init_owned_functions
unset mzsh_init_style_contexts mzsh_init_style_names mzsh_init_owned_options
unset mzsh_init_prior_scalar_values mzsh_init_prior_scalar_types mzsh_init_prior_array_counts mzsh_init_prior_array_values
unset mzsh_init_prior_aliases mzsh_init_prior_functions mzsh_init_prior_styles
unset mzsh_init_prior_style_counts mzsh_init_prior_style_values mzsh_init_prior_options
unset mzsh_portable_zsh_root mzsh_portable_zsh_status
