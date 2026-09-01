# This order is deliberate: it defines command resolution instead of relying
# on lexical filenames or whichever tool happens to be installed.
typeset mzsh_manifest_root="${${(%):-%N}:A:h}"
typeset -a mzsh_loaded_modules=()
typeset -a mzsh_pre_framework_modules=(
  observability
  path
  safety-shims
  macports
  homebrew
  bun
  nvm
  rust
  android
  runtime-paths
  completion-directories
)
typeset -a mzsh_framework_modules=(
  oh-my-zsh
  completion
  prompt-vi
  aliases
  search
  history
  dburl
  ports-manager
  agyp
  private
)

for mzsh_portable_zsh_module in "${mzsh_pre_framework_modules[@]}"; do
  source "$mzsh_manifest_root/modules/$mzsh_portable_zsh_module.zsh" || return 1
  mzsh_loaded_modules+=("$mzsh_portable_zsh_module")
  mzsh_observe "module-loaded:$mzsh_portable_zsh_module"
done

mzsh_path_finalize || return 1

for mzsh_portable_zsh_module in "${mzsh_framework_modules[@]}"; do
  source "$mzsh_manifest_root/modules/$mzsh_portable_zsh_module.zsh" || return 1
  mzsh_loaded_modules+=("$mzsh_portable_zsh_module")
  mzsh_observe "module-loaded:$mzsh_portable_zsh_module"
done

typeset -ga MZSH_LOADED_MODULES=("${mzsh_loaded_modules[@]}")
typeset -g MZSH_PORTABLE_ZSH_VERSION=1
unset mzsh_manifest_root mzsh_portable_zsh_module mzsh_loaded_modules
unset mzsh_pre_framework_modules mzsh_framework_modules
