# Setting Up a New Machine

[Previous: guide index](README.md) ·
[Index: guides](README.md) ·
[Next: audit and read findings](audit-and-read-findings.md)

This tutorial walks through bootstrapping MZSH on a fresh macOS or Linux machine.

## Prerequisites

- Zsh installed as default shell.
- Bun 1.x runtime installed.
- Git.

## Step 1: Clone and Install Dependencies

Clone your MZSH repository to a local directory:

```sh
git clone git@github.com:onurseckin/mzsh.git ~/repos/mzsh
cd ~/repos/mzsh
bun install
```

## Step 2: Run Pre-adoption Audit

Inspect existing environment and shell configurations before making any modifications:

```sh
bun run mzsh -- audit
```

## Step 3: Plan and Apply Bootstrap

Generate a dry-run adoption plan:

```sh
bun run mzsh -- bootstrap --source "$PWD"
```

Review the plan output. If satisfied, apply the adoption transaction:

```sh
bun run mzsh -- bootstrap --source "$PWD" --apply
```

MZSH creates stable loaders in `~/.zshenv`, `~/.zprofile`, and `~/.zshrc`, links the `portable/zsh` tree, and records an immutable receipt in `~/.config/mzsh/receipts/`.

## Step 4: Verify in a Fresh Shell

Open a new terminal tab and verify that MZSH loaded successfully:

```sh
echo "$MZSH_PORTABLE_ZSH_VERSION"
```
