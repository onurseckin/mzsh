# Antigravity account manager and per-shell agy router
[[ -o interactive ]] || return 0

function _agyp_binary() {
  local resolved
  resolved="$(whence -p agyp 2>/dev/null)"
  if [[ -n "$resolved" && -f "$resolved" ]]; then
    print -r -- "$resolved"
    return 0
  fi
  if [[ -f "$HOME/.local/bin/agyp" ]]; then
    print -r -- "$HOME/.local/bin/agyp"
    return 0
  fi
  if [[ -f "${0:A:h}/../../../bin/agyp.ts" ]]; then
    print -r -- "${0:A:h}/../../../bin/agyp.ts"
    return 0
  fi
  return 1
}

function agyp() {
  local agyp_bin
  if ! agyp_bin="$(_agyp_binary)"; then
    print -u2 -- "mzsh: agyp executable not found in PATH"
    return 1
  fi

  # The menu draws on /dev/tty; stdout carries only shell assignments.
  local cmd_output exit_code
  if [[ "$agyp_bin" == *.ts ]]; then
    cmd_output=$(bun "$agyp_bin" "$@")
  else
    cmd_output=$("$agyp_bin" "$@")
  fi
  exit_code=$?

  if (( exit_code != 0 )); then
    [[ -n "$cmd_output" ]] && print -u2 -- "$cmd_output"
    return $exit_code
  fi

  local line
  while IFS= read -r line; do
    case "$line" in
      export\ AGYP_*|unset\ AGYP_*)
        eval "$line"
        ;;
      '')
        ;;
      *)
        print -r -- "$line"
        ;;
    esac
  done <<< "$cmd_output"

  if [[ "$cmd_output" == *"export AGYP_ACCOUNT="* && -n "${AGYP_ACCOUNT:-}" ]]; then
    print -- "\x1b[1;32m✓\x1b[0m This shell now uses \x1b[1;37m${AGYP_ACCOUNT}\x1b[0m"
  fi

  return 0
}

function agy() {
  # Guard the line discipline against flow-control lockups (Ctrl-S/Q) and
  # delayed suspend (Ctrl-Y), which agy's full-screen mode cannot recover from.
  stty -ixon -ixoff -tostop dsusp undef 2>/dev/null || true

  # No account bound to this shell: run against the global default untouched.
  if [[ -z "${AGYP_HOME:-}" || ! -d "$AGYP_HOME" ]]; then
    command agy "$@"
    return $?
  fi

  # agy resolves both ~/.gemini and its keychain search list from HOME, so the
  # sandbox home is the whole switch. Unlock first: the account keychain has an
  # empty password precisely so this never raises a GUI prompt.
  local account_keychain="$AGYP_HOME/Library/Keychains/agyp.keychain-db"
  if [[ -f "$account_keychain" ]]; then
    /usr/bin/security unlock-keychain -p '' "$account_keychain" 2>/dev/null || true
  fi

  HOME="$AGYP_HOME" command agy "$@"
}

# A shell that inherits AGYP_HOME (a tmux restore, an agent's cached env) may
# launch agy without the wrapper. Open the account keychain now, so one locked
# since the last restart cannot surface later as a password prompt. Supplying
# the password means this can never prompt itself.
if [[ -n "${AGYP_HOME:-}" && -f "$AGYP_HOME/Library/Keychains/agyp.keychain-db" ]]; then
  /usr/bin/security unlock-keychain -p '' "$AGYP_HOME/Library/Keychains/agyp.keychain-db" 2>/dev/null || true
fi

return 0
