# Every candidate passes through the shared directory validator; this module
# performs no installation, version selection, or network action.
for mzsh_runtime_directory in \
  "${MZSH_LOCAL_BIN:-$HOME/.local/bin}" \
  "${PNPM_HOME:-}" \
  "${MZSH_PNPM_GLOBAL_BIN:-}"; do
  [[ -n $mzsh_runtime_directory ]] && mzsh_path_add_application "$mzsh_runtime_directory"
done
for mzsh_runtime_root in "${RUBY_HOME:-}" "${PYTHONUSERBASE:-}" "${GOPATH:-}" "${JAVA_HOME:-}"; do
  [[ -n $mzsh_runtime_root ]] && mzsh_path_add_application "$mzsh_runtime_root/bin"
done
unset mzsh_runtime_directory mzsh_runtime_root
return 0
