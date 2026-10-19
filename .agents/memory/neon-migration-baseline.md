---
name: Neon migration baseline
description: Why the existing GO COURSE Neon schema must be adopted before applying new Drizzle migrations.
---

When a GO COURSE Neon database already contains the complete school schema but lacks Drizzle's migration ledger, record only the verified initial migration as applied, then run subsequent additive migrations. Preserve all existing records, files, users, and credentials; never replay the baseline schema or rebuild the database.

**Why:** An existing database initialized before the checked-in migration history has working school tables but no migration ledger. Replaying the initial schema fails on existing relations, preventing the new authentication tables from being installed and stopping API startup.

**How to apply:** Verify the complete baseline tables before adopting the migration entry. Let the normal migration runner apply later migrations. If the baseline is incomplete, stop and inspect the schema; do not mark it as applied or perform destructive repairs.
