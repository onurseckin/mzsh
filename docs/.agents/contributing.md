# Contributing to MZSH

Use the repository's exact Bun and tool pins from `mise.toml` and `package.json`. Run focused tests while developing, then run `bun run validate` and `lefthook run pre-commit` before requesting review.

Keep TypeScript strict, avoid suppression directives, and keep changes within the managed-shell ownership boundary. Use checkout-local commands such as `bun run mzsh -- audit` in examples.
