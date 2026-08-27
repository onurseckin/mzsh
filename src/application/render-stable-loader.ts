export function renderStableLoader(path: ".zshenv" | ".zprofile" | ".zshrc"): string {
  const boundary = path === ".zshrc" ? "[[ -o interactive ]] || return 0\n" : path === ".zprofile" ? "[[ -o login ]] || return 0\n" : "";
  const source = `"${"${XDG_CONFIG_HOME:-$HOME/.config}"}/mzsh/current/loaders/${path.slice(1)}.zsh"`;
  return `# mzsh-managed-loader\n${boundary}if [[ ! -r ${source} ]]; then\n  [[ -o interactive ]] && print -u2 -- "mzsh: managed loader unavailable"\n  return 0\nfi\nsource ${source}\n`;
}
