# MZSH contributor guidance

Use Bun for dependency installation, scripts, tests, and builds. Run `bun run validate` before submitting a complete change and use `lefthook run pre-commit` before committing.

Keep shell startup deterministic and loader-only. Changes that can mutate managed state must preserve plan review, explicit confirmation, receipts, and recovery behavior.

Keep private values, private assignment names, personal paths, and machine-specific state out of source, tests, fixtures, diagnostics, and documentation. Test shell safety only with isolated fake executables.
