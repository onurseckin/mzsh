# Configuring Private State and Runtime Paths

[Previous: rollback and recovery](rollback-and-recovery.md) ·
[Index: guides](README.md) ·
[Next: configure completions and fzf](configure-completions-and-fzf.md)

MZSH separates private environment variables and host tool directories from the public Git repository.

## Private Environment Variables

All API keys, tokens, and host-specific variables live in `~/.config/mzsh/private.zsh`:

- Owned strictly by the current user (`chmod 600 ~/.config/mzsh/private.zsh`).
- Sourced last in interactive shell sessions.
- Automatically ignored by Git and excluded from receipts and audit logs.

### Using the Env Command

- List configured variable names:
  ```sh
  bun run mzsh -- env list
  ```
- Check if a specific variable is defined:
  ```sh
  bun run mzsh -- env get TOKEN_NAME
  ```
- Set a variable securely via protected interactive prompt:
  ```sh
  bun run mzsh -- env set TOKEN_NAME
  ```

## Generic Runtime Symlinks

Host toolchains can be mapped into `$PATH` via directory symlinks in `~/.config/mzsh/runtime-paths/`:

- `python` -> `/path/to/custom/python/bin`
- `java` -> `/path/to/jdk/bin`
- `go` -> `/path/to/go/bin`
- `pnpm` -> `/path/to/pnpm/global/bin`
- `ruby` -> `/path/to/ruby/bin`
- `postgresql` -> `/path/to/pgsql/bin`

MZSH registers valid symlinks ahead of standard system tools without executing shell scripts during startup.
