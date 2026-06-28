# Security Specification - AAB Editor

## Data Invariants
1. A configuration document must have a `key`, `value`, and `updatedAt` field.
2. A bundle metadata document must have a `bundleId` and `createdAt`.
3. DUNS numbers should be reasonably formatted (9 digits).
4. Integrity tokens are immutable once assigned to a bundle version (in this simplified model, we allow updates but enforce schema).

## The "Dirty Dozen" Payloads (Anti-Patterns)
1. **Identity Spoofing**: Attempt to update a bundle configuration without being signed in.
2. **ID Poisoning**: Use a 1MB string as a document ID.
3. **Ghost Field Injection**: Add `isVerified: true` to a configuration document.
4. **PII Leak**: Attempt to read all bundle metadata anonymously.
5. **Type Poisoning**: Send a number for the `duns` field when a string is expected.
6. **Immutable Breach**: Attempt to change the `createdAt` timestamp.
7. **Relational Orphan**: Create a metadata record for a bundle that doesn't exist (if we had a bundles collection).
8. **Resource Exhaustion**: Send an array of 10,000 tags.
9. **State Shortcut**: Move a bundle status from 'draft' to 'published' without verification.
10. **Admin Escalation**: Attempt to write to `/admins/` collection.
11. **Query Scrape**: List all tokens without a specific bundle filter.
12. **Cross-Tenant Write**: User A attempting to edit User B's bundle (not applicable in this open tool, but a future risk).

## Security Assertions
- All reads must be authenticated.
- All writes must be authenticated and valid IDs used.
- No blanket reads are permitted.
