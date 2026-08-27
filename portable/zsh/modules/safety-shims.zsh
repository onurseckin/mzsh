# Managed shims are first so aliases and interactive commands resolve through
# the guard boundary without changing PATH during source beyond registration.
typeset mzsh_shim_directory="${MZSH_COMMAND_SHIM_DIR:-${${(%):-%N}:A:h:h}/shims}"
mzsh_path_add_shim "$mzsh_shim_directory"
unset mzsh_shim_directory
return 0
