# Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Shared Public Visibility**: All documents in `/strategies/{strategyId}` represent community-shared strategies with `visibility == 'public'`, readable by any user via `where('visibility', '==', 'public')`.
2. **Author Identity Integrity & Expiration Cleanup**: Every strategy document must carry `authorUid == request.auth.uid` on creation, and `authorUid` is immutable thereafter. Only the verified author (`request.auth.token.email_verified == true && existing().authorUid == request.auth.uid`) may update a strategy or delete an active (non-expired) strategy; any verified user may delete a strictly expired strategy (`existing().expiresAt <= request.time`) for automatic database cleanup.
3. **Zero-PII Isolation**: Shared strategy documents store only `authorUid` and public `authorName` (max 80 chars) — never `email`, `phone`, or `address`.
4. **Strict Schema & Bounds**: All 27 fields must be present with exact allowed keys (`hasAll` + `hasOnly`), bounded strings (`size()`), bounded numeric ranges, valid tire map (`soft`, `medium`, `hard`, `intermediate`, `wet`), and bounded `stints` array (`1..50` items with element 0 validated).
5. **Temporal Integrity & 10-Day Max Retention**: `createdAt` and `updatedAt` must equal `request.time` on creation; `expiresAt` must be a `timestamp` within `(request.time, request.time + 10 days]` on creation and immutable on update; `createdAt` is immutable on update and `updatedAt` must equal `request.time`.

## 2. "Dirty Dozen" Attack Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Create**: Creating a strategy while `request.auth == null`.
2. **Unverified Email Create**: Creating a strategy with `request.auth.token.email_verified == false`.
3. **Identity Spoofing**: Creating a strategy with `authorUid` set to another user's UID (`"other-user-uid"`).
4. **Shadow / Ghost Field Injection**: Creating a strategy with an unexpected extra key such as `isAdmin: true` or `email: "leak@example.com"`.
5. **Document ID Poisoning**: Writing to `/strategies/invalid$id` or a >128-character document ID.
6. **Unbounded String / Denial-of-Wallet**: Submitting a `title` > 100 chars or `trackName` > 120 chars.
7. **Empty or Oversized Stints Array**: Submitting `stints: []` or `stints` with > 50 items.
8. **Malformed Stint Element**: Submitting `stints[0]` with invalid compound (`"ultrasoft"`) or `laps: 0`.
9. **Client Timestamp / Retention Forgery**: Creating a strategy with `createdAt != request.time`, `expiresAt <= request.time`, or `expiresAt > request.time + 10 days` (e.g. 30 days).
10. **Unauthorized Update / Expiration Extension**: Updating another user's strategy or attempting to mutate `authorUid`, `createdAt`, or `expiresAt`.
11. **Unauthorized Delete of Active Strategy**: Deleting a non-expired strategy (`existing().expiresAt > request.time`) owned by a different user, or unauthenticated delete of an expired strategy.
12. **Unscoped List Query**: Running a `list` query on `/strategies` without filtering `where('visibility', '==', 'public')`.
