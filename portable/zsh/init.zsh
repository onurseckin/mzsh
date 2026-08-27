# Source this file from a shell profile. It is self-contained and never reads a
# machine's existing Zsh configuration.
if [[ -n ${MZSH_PORTABLE_ZSH_INITIALIZED:-} ]]; then
  return 0
fi

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

  unset MZSH_PORTABLE_ZSH_INITIALIZED MZSH_LOADED_MODULES MZSH_PORTABLE_ZSH_VERSION
  unset MZSH_COMPLETION_OWNER MZSH_COMPLETION_INITIALIZED MZSH_OH_MY_ZSH_LOADED
  unset MZSH_NVM_POLICY MZSH_PATH_SHIMS MZSH_PATH_APPLICATIONS
  for mzsh_init_function in mzsh_observe mzsh_path_add_shim mzsh_path_add_application \
    mzsh_path_canonicalize mzsh_path_finalize mzsh_completion_add_directory \
    mzsh_completion_initialize mzsh_private_mode mzsh_private_owner; do
    (( $+functions[$mzsh_init_function] )) && unset -f "$mzsh_init_function"
  done
  unset mzsh_init_original_path mzsh_init_had_fpath mzsh_init_original_fpath
  unset mzsh_init_function mzsh_portable_zsh_root mzsh_portable_zsh_status
  return 1
fi

unset mzsh_init_original_path mzsh_init_had_fpath mzsh_init_original_fpath
unset mzsh_portable_zsh_root mzsh_portable_zsh_status
