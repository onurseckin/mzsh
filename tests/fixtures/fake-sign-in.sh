#!/usr/bin/env bash
# Stand-in for an interactive Antigravity sign-in. Stores a credential into the
# sandbox keychain through the fake security tool, exactly where go-keyring
# would put it, then exits as if the user had quit.
set -euo pipefail
"${FAKE_SECURITY:?}" add-generic-password -U -s gemini -a antigravity -w "${FAKE_SIGN_IN_BLOB:-fresh-credential}" \
  "$HOME/Library/Keychains/agyp.keychain-db"
