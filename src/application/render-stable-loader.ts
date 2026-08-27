export function renderStableLoader(path: '.zshenv' | '.zprofile' | '.zshrc'): string {
  const boundary =
    path === '.zshrc'
      ? '[[ -o interactive ]] || return 0\n'
      : path === '.zprofile'
        ? '[[ -o login ]] || return 0\n'
        : '';
  const source = `"${'${XDG_CONFIG_HOME:-$HOME/.config}'}/mzsh/current/loaders/${path.slice(1)}.zsh"`;
  const instantPrompt =
    path === '.zshrc'
      ? 'typeset mzsh_instant_prompt="${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"\nif [[ -r $mzsh_instant_prompt && ! -L $mzsh_instant_prompt ]]; then\n  source "$mzsh_instant_prompt"\nfi\nunset mzsh_instant_prompt\n'
      : '';
  return `# mzsh-managed-loader\n${boundary}${instantPrompt}if [[ ! -r ${source} ]]; then\n  [[ -o interactive ]] && print -u2 -- "mzsh: managed loader unavailable"\n  return 0\nfi\nsource ${source}\n`;
}
