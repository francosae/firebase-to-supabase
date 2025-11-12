# Migration Tracking Guide

## Understanding Migration States

When migrating from Firebase to Supabase, there are **two different processes** that happen:

### 1. Session Exchange (Temporary)

**What it does:**
- Validates an existing Firebase ID token
- Issues a Supabase session for the same user
- Allows users to stay logged in during migration

**What it DOESN'T do:**
- Does NOT migrate the user's password
- Does NOT remove dependency on Firebase Auth
- Temporary solution only

**Tracked by:** `raw_user_meta_data->>'last_firebase_session_exchange'`

**Status:** ⚠️ **Temporary** - If Firebase Auth is turned off, these users can't sign in again!

### 2. Full Password Migration (Permanent)

**What it does:**
- Verifies the user's password against Firebase scrypt hash
- Converts password to Supabase bcrypt format
- Removes dependency on Firebase Auth
- User can now sign in with Supabase directly

**Tracked by:** `encrypted_password IS NOT NULL`

**Status:** ✅ **Permanent** - User is fully migrated and Firebase Auth is no longer needed

## Migration States

Users can be in one of these states:

| State | Description | Risk Level |
|-------|-------------|------------|
| **✅ Fully Migrated** | Password converted to Supabase | ✅ Safe |
| **⚠️ Session Exchanged Only** | Got Supabase session but password not migrated | ⚠️ At Risk! |
| **❌ Not Migrated** | Hasn't signed in yet | ⏳ Waiting |
| **🔐 OAuth User** | No password to migrate | ✅ Safe after re-auth |

## At-Risk Users

**Definition:** Users who had session exchange but haven't completed full migration yet.

**Why they're at risk:**
- They're using Supabase currently (via session exchange)
- But their authentication still depends on Firebase
- If Firebase Auth is turned off, they **cannot sign in again**
- Their current session will work until it expires

**How to fix:**
1. Keep Firebase Auth running until all at-risk users migrate
2. Encourage users to sign in with their password (triggers auto-migration)
3. Monitor the "Session Exchanged Only" count
4. Don't disable Firebase Auth until this count reaches 0

## Monitoring Migration Progress

### Quick Check (Command Line)

```bash
# Run the monitoring dashboard
chmod +x auth/monitor-migration.sh
./auth/monitor-migration.sh xnpdfycynygjqsmbmapr
```

### Detailed Analysis (SQL)

```bash
# Run all tracking queries
supabase db query --project-ref xnpdfycynygjqsmbmapr \
  -f auth/check-migration-progress.sql
```

### Key Metrics to Watch

1. **Migration Completion %** - Percentage of users fully migrated
2. **Session Exchanged Only** - Users at risk (should trend toward 0)
3. **Recent Activity** - Are users actively migrating?
4. **At-Risk User Count** - Critical metric before disabling Firebase

## Migration Timeline Example

```
Day 1: Deploy session exchange + password migration
  - 1000 users total
  - 0 fully migrated
  - 0 session exchanged

Day 7: Users starting to migrate
  - 1000 users total
  - 200 fully migrated (20%)
  - 150 session exchanged only (⚠️ 15% at risk)
  - 650 not migrated (65%)

Day 30: Migration mostly complete
  - 1000 users total
  - 850 fully migrated (85%)
  - 50 session exchanged only (⚠️ 5% at risk)
  - 100 not migrated (10%)

Day 60: Ready to disable Firebase
  - 1000 users total
  - 950 fully migrated (95%)
  - 0 session exchanged only (✅ Safe to disable Firebase!)
  - 50 inactive users (won't affect them)
```

## When is it Safe to Disable Firebase Auth?

✅ **Safe to disable when:**
- Migration completion % > 95%
- **Session Exchanged Only = 0** (Critical!)
- Remaining "Not Migrated" users are inactive/archived
- All active users have completed full migration

❌ **NOT safe to disable when:**
- Session Exchanged Only > 0
- Active users haven't completed password migration
- Recent activity shows users still relying on session exchange

## Queries Reference

All queries are in `auth/check-migration-progress.sql`:

1. **Overall Summary** - High-level migration stats
2. **Migration State Breakdown** - Detailed state distribution
3. **Migration Status by User Type** - Password vs OAuth users
4. **At-Risk Users** - Session exchanged but not migrated (CRITICAL!)
5. **Recent Session Exchanges** - Last 24 hours activity
6. **Users Needing Migration** - Full list of pending users
7. **OAuth Users** - No password to migrate
8. **Migration Timeline** - Daily migration trends
9. **Find Specific User** - Check individual user status
10. **Inactive Users** - Users who haven't signed in

## Best Practices

### During Migration

1. **Monitor daily** - Run `monitor-migration.sh` daily
2. **Track at-risk users** - Focus on reducing "Session Exchanged Only"
3. **Communicate with users** - Encourage password sign-in to complete migration
4. **Keep Firebase running** - Don't disable until safe

### After Migration

1. **Clean up Firebase data** - Remove `fbuser` from user metadata
2. **Archive Firebase project** - But don't delete immediately
3. **Monitor sign-ins** - Ensure no one is stuck
4. **Update documentation** - Remove Firebase references

## Troubleshooting

### "Why are my session exchange users not migrating?"

- They're staying logged in via refresh tokens
- They haven't entered their password since migration started
- Solution: Prompt users to re-enter password or add migration reminder

### "Can I force users to migrate?"

- No, but you can:
  - Show in-app prompt asking them to sign in again
  - Expire sessions to force re-authentication
  - Send email reminders about migration

### "What happens to inactive users?"

- They'll need to reset password if they return after Firebase is disabled
- Or use OAuth if they previously used it
- Not a concern if they're truly inactive

## Migration Checklist

- [ ] Deploy session exchange function
- [ ] Deploy password migration function
- [ ] Set up monitoring queries
- [ ] Run initial baseline metrics
- [ ] Monitor daily for 2-4 weeks
- [ ] Wait for "Session Exchanged Only" to reach 0
- [ ] Verify all active users fully migrated
- [ ] Clean up Firebase data from Supabase
- [ ] Disable Firebase Auth
- [ ] Archive Firebase project (keep as backup)
- [ ] Remove Firebase dependencies from codebase
