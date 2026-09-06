#!/usr/bin/env bash
# Isolated stand-in for /usr/bin/security.
#
# Stores one credential per keychain as a sibling ".items" file so tests can
# observe that account keychains and the login keychain never share state.
# The search list lives under Library/Preferences, mirroring where the real
# tool keeps it, so it never shows up as a stray entry in a sandbox home.
set -euo pipefail

command="${1:-}"; shift || true
search_list="${HOME}/Library/Preferences/search-list"
default_keychain_file="${HOME}/Library/Preferences/default-keychain"

item_file() { printf '%s.items' "$1"; }

case "$command" in
  create-keychain)
    shift 2
    : > "$1"; : > "$(item_file "$1")"
    # macOS reserves login.keychain-db and ignores the supplied password.
    [[ "$(basename "$1")" == "login.keychain-db" ]] && printf 'reserved' > "$1.pw"
    ;;
  unlock-keychain)
    shift 2
    [[ -f "$1" ]] || exit 51
    # A reserved-name keychain does not take the supplied password.
    [[ -f "$1.pw" ]] && exit 51
    rm -f "$1.locked"
    exit 0
    ;;
  lock-keychain)
    : > "$1.locked"
    ;;
  set-keychain-settings)
    : > "$1.nolock"
    ;;
  default-keychain)
    if [[ " $* " == *" -s "* ]]; then
      while [[ "${1:-}" != "-s" ]]; do shift; done
      shift
      mkdir -p "$(dirname "$default_keychain_file")"
      printf '    "%s"\n' "$1" > "$default_keychain_file"
    elif [[ -f "$default_keychain_file" ]]; then
      cat "$default_keychain_file"
    fi
    ;;
  list-keychains)
    if [[ " $* " == *" -s "* ]]; then
      while [[ "${1:-}" != "-s" ]]; do shift; done
      shift
      mkdir -p "$(dirname "$search_list")"
      : > "$search_list"
      for entry in "$@"; do printf '    "%s"\n' "$entry" >> "$search_list"; done
    elif [[ -f "$search_list" ]]; then
      cat "$search_list"
    fi
    ;;
  add-generic-password)
    blob=""; keychain=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        -U) shift ;;
        -s|-a) shift 2 ;;
        -w) blob="$2"; shift 2 ;;
        *) keychain="$1"; shift ;;
      esac
    done
    [[ -n "$keychain" ]] || exit 1
    printf '%s' "$blob" > "$(item_file "$keychain")"
    ;;
  find-generic-password)
    keychain=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        -w) shift ;;
        -s|-a) shift 2 ;;
        *) keychain="$1"; shift ;;
      esac
    done
    if [[ -z "$keychain" ]]; then
      [[ -f "$search_list" ]] || exit 44
      while read -r line; do
        candidate="${line//[\" ]/}"
        if [[ -s "$(item_file "$candidate")" ]]; then cat "$(item_file "$candidate")"; exit 0; fi
      done < "$search_list"
      exit 44
    fi
    [[ -f "$keychain.locked" ]] && exit 51
    [[ -s "$(item_file "$keychain")" ]] || exit 44
    cat "$(item_file "$keychain")"
    ;;
  delete-generic-password)
    keychain="${!#}"
    [[ -f "$(item_file "$keychain")" ]] || exit 44
    : > "$(item_file "$keychain")"
    ;;
  *)
    exit 1
    ;;
esac
