# MZSH safety boundary

MZSH plans before it applies. Mutations require explicit confirmation, operate only on owned targets, publish durable receipts, and preserve a recovery path.

Do not add shell startup package installation, network access, arbitrary evaluation, or unmanaged startup mutations. Do not copy or expose private values, private assignment names, personal paths, receipts, or host-specific data in public repository content.

Use isolated fixtures and fake executables when testing shell or command safety behavior.
