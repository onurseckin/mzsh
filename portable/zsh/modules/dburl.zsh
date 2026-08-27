# Generic URL inspection is local-only and never prints a password-bearing value.
[[ -o interactive ]] || return 0

function _mzsh_dburl_decode() {
  local value="${1//+/ }"
  printf '%b' "${value//\%/\\x}"
}

function _mzsh_dburl_sensitive_key() {
  local normalized="$(_mzsh_dburl_decode "$1")"
  normalized="${normalized:l}"
  normalized="${normalized//[^a-z0-9]/}"
  case "$normalized" in
    *password*|*pass*|*pwd*|*secret*|*token*|*credential*|*cred*|*apikey*|*auth*|*key*) return 0 ;;
    *) return 1 ;;
  esac
}

function dburl() {
  if (( $# != 1 )) || [[ $1 != *://* ]]; then
    print -u2 -- 'Usage: dburl <database-url>'
    return 1
  fi

  local url="$1" scheme rest userinfo='' hostpart username='' password=''
  local main query='' hostport database='' hostname port=''
  scheme="${url%%://*}"
  rest="${url#*://}"
  if [[ $rest == *@* ]]; then
    userinfo="${rest%@*}"
    hostpart="${rest##*@}"
  else
    hostpart="$rest"
  fi
  username="${userinfo%%:*}"
  [[ $userinfo == *:* ]] && password="${userinfo#*:}"
  main="${hostpart%%\?*}"
  [[ $hostpart == *\?* ]] && query="${hostpart#*\?}"
  hostport="${main%%/*}"
  [[ $main == */* ]] && database="${main#*/}"
  hostname="${hostport%:*}"
  [[ $hostport == *:* ]] && port="${hostport##*:}"
  [[ $hostport != *:* ]] && hostname="$hostport"

  print -r -- "scheme: $scheme"
  print -r -- "username: $(_mzsh_dburl_decode "$username")"
  [[ -n $password ]] && print -r -- 'password: [redacted]' || print -r -- 'password:'
  print -r -- "hostname: $hostname"
  print -r -- "port: $port"
  print -r -- "database: $(_mzsh_dburl_decode "$database")"

  local parameter key value
  for parameter in "${(@s:&:)query}"; do
    key="${parameter%%=*}"
    value=''
    [[ $parameter == *=* ]] && value="${parameter#*=}"
    if _mzsh_dburl_sensitive_key "$key"; then
      print -r -- "${key}: [redacted]"
    else
      print -r -- "${key}: $(_mzsh_dburl_decode "$value")"
    fi
  done
}

return 0
