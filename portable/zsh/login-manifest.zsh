# Login shells receive only deterministic executable paths. Interactive state,
# plugins, prompts, completion, aliases, and private values are excluded.
if [[ ${MZSH_PORTABLE_ZSH_LOGIN_INITIALIZED:-} == 1 ]]; then
  return 0
fi

typeset mzsh_login_original_path="$PATH"
typeset -g MZSH_PORTABLE_ZSH_LOGIN_INITIALIZED=1
typeset mzsh_login_manifest_root="${${(%):-%N}:A:h}"
typeset -a mzsh_login_modules=(
  observability
  path
  safety-shims
  macports
  homebrew
  bun
  rust
  android
  runtime-paths
)
typeset -a mzsh_login_loaded_modules=()
typeset mzsh_login_status=0

for mzsh_login_module in "${mzsh_login_modules[@]}"; do
  source "$mzsh_login_manifest_root/modules/$mzsh_login_module.zsh" || {
    mzsh_login_status=1
    break
  }
  mzsh_login_loaded_modules+=("$mzsh_login_module")
  mzsh_observe "login-module-loaded:$mzsh_login_module"
done

if (( mzsh_login_status == 0 )); then
  mzsh_path_finalize || mzsh_login_status=1
fi

if (( mzsh_login_status != 0 )); then
  PATH="$mzsh_login_original_path"
  export PATH
  unset MZSH_PORTABLE_ZSH_LOGIN_INITIALIZED MZSH_LOGIN_LOADED_MODULES
  unset MZSH_HOMEBREW_EFFECTIVE_PREFIX MZSH_PATH_SHIMS MZSH_PATH_RUNTIMES MZSH_PATH_APPLICATIONS
  for mzsh_login_function in mzsh_observe mzsh_path_add_shim mzsh_path_add_application \
    mzsh_path_add_runtime mzsh_path_canonicalize mzsh_path_finalize \
    mzsh_runtime_directory_mode mzsh_runtime_directory_owner \
    mzsh_runtime_add_directory_entries; do
    (( $+functions[$mzsh_login_function] )) && unset -f "$mzsh_login_function"
  done
  unset mzsh_login_original_path mzsh_login_manifest_root mzsh_login_modules
  unset mzsh_login_loaded_modules mzsh_login_module mzsh_login_function mzsh_login_status
  return 1
fi

typeset -ga MZSH_LOGIN_LOADED_MODULES=("${mzsh_login_loaded_modules[@]}")
unset mzsh_login_original_path mzsh_login_manifest_root mzsh_login_modules
unset mzsh_login_loaded_modules mzsh_login_module mzsh_login_status
return 0
