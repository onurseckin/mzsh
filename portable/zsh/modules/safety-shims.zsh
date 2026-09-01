# Managed shims are first so aliases and interactive commands resolve through
# the guard boundary without changing PATH during source beyond registration.
typeset mzsh_shim_directory="${MZSH_COMMAND_SHIM_DIR:-${${(%):-%N}:A:h:h}/shims}"
mzsh_path_add_shim "$mzsh_shim_directory"
unset mzsh_shim_directory

# Ignore SIGPIPE to avoid abrupt process termination on streaming broken pipes
# during high-speed voice dictation bursts or piped command pipelines.
trap -- '' PIPE 2>/dev/null || trap '' PIPE 2>/dev/null || true

return 0

