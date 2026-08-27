# CARGO_HOME is configurable; its conventional home-relative default is safe
# when Rust is not installed because the directory guard keeps it out of PATH.
typeset mzsh_cargo_home="${CARGO_HOME:-$HOME/.cargo}"
mzsh_path_add_application "$mzsh_cargo_home/bin"
unset mzsh_cargo_home
