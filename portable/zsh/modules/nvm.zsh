# NVM manages active Node versions itself; load it only when its loader exists.
typeset -g MZSH_NVM_POLICY=existing-installation-only

if [[ -n ${NVM_DIR:-} && -r $NVM_DIR/nvm.sh ]]; then
  source "$NVM_DIR/nvm.sh" || return 1
  [[ -n ${NVM_BIN:-} ]] && mzsh_path_add_runtime "$NVM_BIN"
fi

return 0
