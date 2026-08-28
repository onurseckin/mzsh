# MZSH Architecture

[Index: repository README](../../README.md) ·
[Next: managed shell topology](managed-shell-topology.md)

MZSH is a local-only, receipt-backed managed Zsh topology and developer-tool foundation. It separates public shell configuration from private credentials, uses transactional adoption with receipt-backed rollbacks, and provides observational machine inventory without mutating the host.

## Architecture Documents

- [Documentation and safety portability design](documentation-and-safety-portability-design.md): Information architecture and documentation standards.
- [Product decisions](mzsh-product-decisions.md): Accepted product direction, runtime foundation, and boundaries.
- [Managed shell topology](managed-shell-topology.md): Entrypoint loaders, manifest execution order, and private boundaries.
- [Adoption transactions](adoption-transactions.md): Review-before-apply workflow, receipts, and rollback guarantees.
- [CLI and discovery](cli-and-discovery.md): Command catalog, Commander adapter, OpenTUI, and observational inventory.
- [Safety shims](safety-shims.md): Command interceptors, path precedence, and destructive protection boundaries.
