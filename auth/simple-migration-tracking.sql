-- Simple Migration Tracking
-- Session Exchange IS the migration - track who's using Supabase

-- ============================================================
-- 1. MIGRATION OVERVIEW (The Only Metric That Matters)
-- ============================================================
SELECT
  COUNT(*) as total_firebase_users,
  COUNT(*) FILTER (WHERE last_sign_in_at IS NOT NULL) as using_supabase,
  COUNT(*) FILTER (WHERE last_sign_in_at IS NULL) as not_using_supabase_yet,
  ROUND(100.0 * COUNT(*) FILTER (WHERE last_sign_in_at IS NOT NULL) / COUNT(*), 2) as pct_migrated
FROM auth.users
WHERE raw_user_meta_data->'fbuser' IS NOT NULL;


-- ============================================================
-- 2. ACTIVE USERS (Last 30 Days)
-- ============================================================
SELECT
  COUNT(*) as active_users_last_30_days,
  COUNT(*) FILTER (WHERE encrypted_password IS NOT NULL) as with_password_migrated,
  COUNT(*) FILTER (WHERE encrypted_password IS NULL) as password_not_migrated
FROM auth.users
WHERE last_sign_in_at > NOW() - INTERVAL '30 days';


-- ============================================================
-- 3. READY TO DISABLE FIREBASE?
-- ============================================================
-- Users created in last 90 days who haven't signed in to Supabase yet
SELECT COUNT(*) as users_still_needing_firebase
FROM auth.users
WHERE last_sign_in_at IS NULL
  AND created_at > NOW() - INTERVAL '90 days'
  AND raw_user_meta_data->'fbuser' IS NOT NULL;
-- If this is 0, Firebase can be safely disabled


-- ============================================================
-- 4. MIGRATION TIMELINE (Activity by Day)
-- ============================================================
SELECT
  DATE(last_sign_in_at) as date,
  COUNT(*) as users_active
FROM auth.users
WHERE last_sign_in_at IS NOT NULL
  AND last_sign_in_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(last_sign_in_at)
ORDER BY date DESC;


-- ============================================================
-- 5. USERS WHO HAVEN'T MIGRATED YET
-- ============================================================
SELECT
  email,
  created_at,
  raw_user_meta_data->'fbuser'->>'uid' as firebase_uid,
  AGE(NOW(), created_at) as account_age
FROM auth.users
WHERE last_sign_in_at IS NULL
  AND raw_user_meta_data->'fbuser' IS NOT NULL
  AND created_at > NOW() - INTERVAL '90 days'  -- Only recent accounts
ORDER BY created_at DESC
LIMIT 100;


-- ============================================================
-- 6. ACTIVE SESSIONS RIGHT NOW
-- ============================================================
SELECT
  COUNT(*) as total_active_sessions,
  COUNT(DISTINCT user_id) as unique_users_with_sessions
FROM auth.sessions
WHERE revoked_at IS NULL
  AND last_active_at > NOW() - INTERVAL '7 days';


-- ============================================================
-- 7. PASSWORD MIGRATION STATUS (Optional - Nice to Know)
-- ============================================================
SELECT
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE encrypted_password IS NOT NULL) as password_migrated,
  COUNT(*) FILTER (WHERE encrypted_password IS NULL) as password_not_migrated,
  ROUND(100.0 * COUNT(*) FILTER (WHERE encrypted_password IS NOT NULL) / COUNT(*), 2) as pct_password_migrated
FROM auth.users
WHERE raw_user_meta_data->'fbuser'->'passwordHash' IS NOT NULL;
-- This is optional - most users won't migrate passwords and that's OK


-- ============================================================
-- 8. CHECK SPECIFIC USER
-- ============================================================
SELECT
  email,
  last_sign_in_at,
  encrypted_password IS NOT NULL as password_migrated,
  raw_user_meta_data->'fbuser'->>'uid' as firebase_uid,
  created_at,
  CASE
    WHEN last_sign_in_at IS NOT NULL THEN '✅ Using Supabase'
    ELSE '⏳ Not migrated yet'
  END as status
FROM auth.users
WHERE email = 'gino.rey@outlook.com';
