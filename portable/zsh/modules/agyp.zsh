# Antigravity Multi-Account Switcher & Environment Router
[[ -o interactive ]] || return 0

function agyp() {
  local agyp_bin=""
  
  agyp_bin="$(whence -p agyp 2>/dev/null)"

  if [[ -z "$agyp_bin" || ! -f "$agyp_bin" ]]; then
    if [[ -f "$HOME/.local/bin/agyp" ]]; then
      agyp_bin="$HOME/.local/bin/agyp"
    elif [[ -f "${0:A:h}/../../../bin/agyp.ts" ]]; then
      agyp_bin="${0:A:h}/../../../bin/agyp.ts"
    fi
  fi

  if [[ -z "$agyp_bin" || ! -f "$agyp_bin" ]]; then
    print -u2 -- "mzsh: agyp executable not found in PATH"
    return 1
  fi

  local cmd_output
  if [[ "$agyp_bin" == *.ts ]]; then
    cmd_output=$(bun "$agyp_bin" "$@")
  else
    cmd_output=$("$agyp_bin" "$@")
  fi
  local exit_code=$?

  if (( exit_code == 0 )) && [[ "$cmd_output" == export* ]]; then
    eval "$cmd_output"
    if [[ -n "${AGY_ACCOUNT:-}" ]]; then
      print -- "\x1b[1;32m✓\x1b[0m Switched active Antigravity account to \x1b[1;37m$AGY_ACCOUNT\x1b[0m"
    fi
  elif [[ -n "$cmd_output" ]]; then
    printf '%s\n' "$cmd_output"
  fi

  return $exit_code
}

function agy() {
  local target_token=""
  if [[ -n "${JETSKI_STANDALONE_OAUTH_TOKEN_PATH:-}" && -f "$JETSKI_STANDALONE_OAUTH_TOKEN_PATH" ]]; then
    target_token="$JETSKI_STANDALONE_OAUTH_TOKEN_PATH"
  elif [[ -n "${AGY_ACCOUNT:-}" && -f "$HOME/.gemini/accounts/$AGY_ACCOUNT/jetski-standalone-oauth-token" ]]; then
    target_token="$HOME/.gemini/accounts/$AGY_ACCOUNT/jetski-standalone-oauth-token"
  fi

  if [[ -n "$target_token" ]]; then
    JETSKI_STANDALONE_OAUTH_TOKEN_PATH="$target_token" command agy "$@"
  else
    command agy "$@"
  fi
}

return 0
