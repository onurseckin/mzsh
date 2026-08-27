import { catalog } from './command-catalog';

function escapeZsh(value: string): string {
  return value.replaceAll("'", "'\\''");
}

export function renderZshCompletion(): string {
  const commandCandidates = catalog.commands
    .map((command) => `'${command.name}:${escapeZsh(command.summary)}'`)
    .join(' ');
  const flagCases = catalog.commands
    .filter((command) => command.parser.flags.length > 0)
    .map((command) => {
      const flags = command.parser.flags
        .map((flag) => `'--${flag.name}:${escapeZsh(flag.description)}'`)
        .join(' ');
      return `    ${command.name})\n      _describe -t options 'options' (${flags})\n      ;;`;
    })
    .join('\n');
  return `#compdef mzsh

_mzsh() {
  local -a commands
  commands=(${commandCandidates})
  if (( CURRENT == 2 )); then
    _describe -t commands 'mzsh command' commands
    return
  fi
  case "$words[2]" in
${flagCases}
  esac
}

_mzsh "$@"
`;
}
