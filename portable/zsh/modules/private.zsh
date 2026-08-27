# The private file is intentionally external to this repository. Refusing a
# group- or world-accessible file prevents accidental secret disclosure through
# a copied or misconfigured dotfiles checkout.
typeset mzsh_private_zsh="${MZSH_PRIVATE_ZSH:-${XDG_CONFIG_HOME:-$HOME/.config}/mzsh/private.zsh}"

function mzsh_private_mode() {
  command stat -f '%Lp' "$1" 2>/dev/null || command stat -c '%a' "$1" 2>/dev/null
}

function mzsh_private_owner() {
  command stat -f '%u' "$1" 2>/dev/null || command stat -c '%u' "$1" 2>/dev/null
}

if [[ -f $mzsh_private_zsh && ! -L $mzsh_private_zsh && -r $mzsh_private_zsh ]]; then
  typeset mzsh_private_mode_value
  typeset mzsh_private_owner_value
  mzsh_private_mode_value="$(mzsh_private_mode "$mzsh_private_zsh")"
  mzsh_private_owner_value="$(mzsh_private_owner "$mzsh_private_zsh")"

  if [[ $mzsh_private_mode_value =~ '^[0-7]{3,4}$' ]] && \
    [[ $mzsh_private_owner_value == $EUID ]] && \
    (( (8#$mzsh_private_mode_value & 8#077) == 0 )); then
    source "$mzsh_private_zsh" || return 1
  else
    mzsh_observe "skipped insecure private override"
  fi

  unset mzsh_private_mode_value mzsh_private_owner_value
elif [[ -e $mzsh_private_zsh || -L $mzsh_private_zsh ]]; then
  mzsh_observe "skipped insecure private override"
fi

unset mzsh_private_zsh
unset -f mzsh_private_mode mzsh_private_owner
return 0
