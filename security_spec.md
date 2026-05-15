# Firestore Security Specification

## 1. Data Invariants
1. A **Conversation** must belong to a valid user (`userId` matches the document path).
2. A **Message** must belong to a valid conversation and have a role of either 'user' or 'partner'.
3. **Users** can only read and write their own data (Zero Trust).
4. **Timestamps** (`createdAt`, `lastMessageAt`) must be validated against `request.time` where possible (though client-side dates are allowed if serverTimestamp is not used, but `request.time` is preferred).
5. **ID formats** must be strictly validated to prevent ID poisoning.

## 2. The "Dirty Dozen" Payloads

### P1: Identity Spoofing (Conversation)
Attempt to create a conversation for another user.
```json
{
  "userId": "attacker_id",
  "title": "Stolen Conversation",
  "status": "active"
}
```
**Expected**: PERMISSION_DENIED

### P2: ID Poisoning (Path Injection)
Using a giant string as a document ID.
```json
// Path: /users/UID/conversations/VERY_LONG_STRING_OVER_128_CHARS...
{
  "userId": "UID",
  "title": "Poison ID"
}
```
**Expected**: PERMISSION_DENIED

### P3: Shadow Field Injection (Message)
Adding an unauthorized field like `isVerified` to a message.
```json
{
  "role": "user",
  "content": "Hello",
  "order": 0,
  "isVerified": true
}
```
**Expected**: PERMISSION_DENIED

### P4: Role Escalation (User)
Trying to set `isAdmin` or `role` on user profile.
```json
{
  "uid": "UID",
  "name": "Admin Wannabe",
  "role": "admin"
}
```
**Expected**: PERMISSION_DENIED

### P5: Outcome Tampering (Conversation)
Modifying `createdAt` during an update.
```json
{
  "title": "Changed Title",
  "createdAt": "2000-01-01T00:00:00Z"
}
```
**Expected**: PERMISSION_DENIED

### P6: Content Overflow (Message)
Sending 1MB of text in `content`.
```json
{
  "role": "user",
  "content": "A".repeat(1000001)
}
```
**Expected**: PERMISSION_DENIED

### P7: Orphaned Message creation
Creating a message for a conversation that doesn't exist (using `exists()` in rules).

### P8: PII Leak (User List)
Listing all user profiles.
**Expected**: PERMISSION_DENIED

### P9: State Shortcut
Moving conversation status from `active` to `archived` if only `resolved` is allowed.

### P10: Timestamp Spoofing
Setting `updatedAt` to a future date.

### P11: Cross-User List Query
Querying conversations without a `userId` filter that matches the auth UID.

### P12: Self-Assigned Identity
Changing `userId` of a conversation document once created.

## 3. Test Runner (Draft)
A comprehensive test suite would use `@firebase/rules-unit-testing`. Since I cannot run it here, I will implement the rules to pass these conceptual tests.
