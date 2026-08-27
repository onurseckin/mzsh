# MacPorts is optional and must be supplied as a discovered prefix.
if [[ -n ${MZSH_MACPORTS_PREFIX:-} ]]; then
  mzsh_path_add_application "$MZSH_MACPORTS_PREFIX/bin"
  mzsh_path_add_application "$MZSH_MACPORTS_PREFIX/sbin"
fi
return 0
