# Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Zero-Trust Catch-All**: By default, all paths `/databases/{database}/documents/{document=**}` deny all reads and writes (`allow read, write: if false;`).
2. **Verified Authentication**: Every write (`create`, `update`, `delete`) requires `request.auth != null && request.auth.token.email_verified == true`.
3. **Path Variable Hardening**: Every single-document target operation (`get`, `create`, `update`, `delete`) validates `{operatorId}` and `{matchId}` via `isValidId(id)` (`id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$')`).
4. **Operator Profile Ownership & PII Isolation**:
   - `/operators/{operatorId}` contains zero PII (no email, phone, or physical address).
   - `operatorId` must strictly equal `request.auth.uid` and `incoming().uid == request.auth.uid`.
   - `createdAt` and `uid` are immutable on update (`incoming().uid == existing().uid && incoming().createdAt == existing().createdAt`).
   - Timestamps must match server time (`incoming().createdAt == request.time` on create; `incoming().updatedAt == request.time` on update).
5. **Match Record Immutability & Relational Integrity**:
   - `/matches/{matchId}` requires `exists(/databases/$(database)/documents/operators/$(request.auth.uid))` on creation so orphaned match records cannot exist without an operator profile.
   - `incoming().uid == request.auth.uid` and `incoming().createdAt == request.time`.
   - Match records are strictly immutable once created (`allow update, delete: if false;`).
   - `allow list` on `/matches/{matchId}` enforces `isSignedIn() && resource.data.uid == request.auth.uid` to prevent unauthorized query scraping.

## 2. The "Dirty Dozen" Payloads

1. **Identity Spoofing on Operator Create**: Authenticated user `user_A` attempts to create `/operators/user_B` or sets `uid: "user_B"`. -> `PERMISSION_DENIED`
2. **Unverified Email Write**: User with `email_verified: false` attempts to create `/operators/user_A`. -> `PERMISSION_DENIED`
3. **Shadow Field Injection on Operator Create**: Payload includes all required keys plus `"isAdmin": true`. -> `PERMISSION_DENIED`
4. **Oversized Callsign (Resource Poisoning)**: Payload sets `callsign` to a 500-character string (`maxLength: 32`). -> `PERMISSION_DENIED`
5. **Invalid Enum Value on Weapon/Skin**: Payload sets `primaryWeaponId: "hacked-laser"` outside the allowed enum list. -> `PERMISSION_DENIED`
6. **Client Timestamp Forgery on Create**: Payload supplies a past or future `createdAt` timestamp != `request.time`. -> `PERMISSION_DENIED`
7. **Immutable Field Mutation on Operator Update**: Operator attempts to change `createdAt` or `uid` during an update. -> `PERMISSION_DENIED`
8. **Update-Gap Type Poisoning**: Operator updates an allowed key (`xp`) with a string `"999999"` instead of an integer/number within bounds. -> `PERMISSION_DENIED`
9. **Orphaned Match Record Creation**: User attempts to create `/matches/match_1` without an existing `/operators/{uid}` document. -> `PERMISSION_DENIED`
10. **Match Outcome Mutation**: User attempts to update `/matches/match_1` to change `outcome` from `"defeat"` to `"victory"`. -> `PERMISSION_DENIED`
11. **Unscoped List Scraping on Matches**: User attempts to list `/matches` documents where `resource.data.uid != request.auth.uid`. -> `PERMISSION_DENIED`
12. **ID Poisoning Attack**: User attempts to create `/operators/invalid$id!with/slashes` or a 500-byte ID. -> `PERMISSION_DENIED`
