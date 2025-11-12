# Revised Migration Strategy: Session Exchange as Primary Migration

## The Actual Strategy

**Session exchange IS the migration** - not a temporary bridge.

### How It Works

1. **User opens app with Firebase session**
   - App detects Firebase auth session exists
   - Calls `exchange-firebase-session` edge function
   - Gets Supabase access_token + refresh_token

2. **User uses Supabase indefinitely**
   - Refresh token gets new access tokens forever
   - No password entry required
   - No dependency on Firebase Auth anymore

3. **Password migration is optional**
   - Only happens if user manually signs in with password
   - Nice to have, but not required
   - Most users will never trigger this

## Why This Works

✅ **Refresh tokens work indefinitely** - User never loses access
✅ **No password resets** - Best user experience
✅ **Firebase can be disabled** - After all users get Supabase sessions
✅ **Simple** - One-time exchange, done

## What "Migration Complete" Means

**Old definition (wrong):**
- ❌ User password converted to Supabase bcrypt

**New definition (correct):**
- ✅ User has Supabase refresh token
- ✅ User can access app via Supabase
- ✅ User no longer needs Firebase

## Tracking Migration Progress

### Key Metrics

1. **Users with Supabase sessions** - The real metric
   ```sql
   SELECT COUNT(*)
   FROM auth.sessions
   WHERE revoked_at IS NULL;
   ```

2. **Users who've signed in to Supabase** - Broader view
   ```sql
   SELECT COUNT(*)
   FROM auth.users
   WHERE last_sign_in_at IS NOT NULL;
   ```

3. **Active sessions in last 30 days**
   ```sql
   SELECT COUNT(DISTINCT user_id)
   FROM auth.sessions
   WHERE last_active_at > NOW() - INTERVAL '30 days'
     AND revoked_at IS NULL;
   ```

### When Can You Disable Firebase?

✅ **Safe to disable when:**
- All active users have Supabase sessions
- No new session exchanges for 7+ days
- All active sessions are Supabase-based

**Check with:**
```sql
-- Users who might still need Firebase
SELECT COUNT(*)
FROM auth.users
WHERE last_sign_in_at IS NULL  -- Never signed in to Supabase
  AND created_at > NOW() - INTERVAL '90 days'  -- Created recently (active)
  AND raw_user_meta_data->'fbuser' IS NOT NULL;  -- Is a Firebase user
```

If this returns 0, Firebase can be disabled.

## Migration Timeline

```
Day 1: Deploy session exchange
  - 0 users migrated

Week 1: Users naturally using app
  - 300 users migrated (30%)
  - Got Supabase sessions automatically
  - Zero disruption

Week 4: Most active users migrated
  - 900 users migrated (90%)
  - 100 inactive users remain

Week 8: Safe to disable Firebase
  - All active users have Supabase sessions
  - Inactive users will just sign in normally when they return
```

## Password Migration (Optional)

Password migration is a **fallback**, not the goal:

**When it triggers:**
- User manually enters password (rare)
- Session expires and they need to re-auth (rare)
- User explicitly signs out and back in (rare)

**Why it's optional:**
- Most users stay logged in via refresh tokens
- Session exchange already gave them Supabase access
- No need to force password entry

## Updated Documentation

### For Users
"Your account has been upgraded. You may notice you're signed out once - just sign back in and you're all set!"

### For Developers
"Session exchange migrates users from Firebase to Supabase sessions. Refresh tokens work indefinitely. Password migration is automatic if user enters password, but not required."

## What We Were Wrong About

❌ **Wrong:** "Session exchange is temporary, users MUST migrate passwords"
✅ **Right:** "Session exchange IS the migration, passwords are optional"

❌ **Wrong:** "Track `last_firebase_session_exchange` to find at-risk users"
✅ **Right:** "Track `last_sign_in_at` to see who's using Supabase"

❌ **Wrong:** "Force users to re-enter password after 30 days"
✅ **Right:** "Let refresh tokens work forever - best UX"

## Simplified Tracking Queries

```sql
-- Simple migration status
SELECT
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE last_sign_in_at IS NOT NULL) as using_supabase,
  COUNT(*) FILTER (WHERE last_sign_in_at IS NULL) as not_migrated_yet,
  ROUND(100.0 * COUNT(*) FILTER (WHERE last_sign_in_at IS NOT NULL) / COUNT(*), 2) as pct_migrated
FROM auth.users
WHERE raw_user_meta_data->'fbuser' IS NOT NULL;

-- Active users (who matter for migration)
SELECT COUNT(*)
FROM auth.users
WHERE last_sign_in_at > NOW() - INTERVAL '30 days';

-- Ready to disable Firebase?
SELECT COUNT(*) as users_still_needing_firebase
FROM auth.users
WHERE last_sign_in_at IS NULL
  AND created_at > NOW() - INTERVAL '90 days'
  AND raw_user_meta_data->'fbuser' IS NOT NULL;
-- If this is 0, you're good to disable Firebase
```

## Bottom Line

**Session exchange gives users Supabase refresh tokens that work forever.**

That's the migration. It's that simple.
