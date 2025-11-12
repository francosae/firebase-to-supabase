-- Migration Progress Tracking Queries
-- Run these in Supabase SQL Editor to monitor your migration
--
-- KEY CONCEPTS:
-- - Session Exchange: Temporary - validates Firebase session, issues Supabase session
-- - Full Migration: Permanent - converts Firebase password → Supabase password
-- - OAuth Users: Need to re-authenticate once, no password to migrate

-- ============================================================
-- 1. OVERALL MIGRATION SUMMARY
-- ============================================================
SELECT
  COUNT(*) as total_users,

  -- Full password migrations (the real goal)
  COUNT(*) FILTER (WHERE encrypted_password IS NOT NULL) as password_migrated,

  -- Users who had session exchange but haven't fully migrated yet
  COUNT(*) FILTER (
    WHERE raw_user_meta_data->>'last_firebase_session_exchange' IS NOT NULL
    AND encrypted_password IS NULL
    AND raw_user_meta_data->'fbuser'->'passwordHash' IS NOT NULL
  ) as session_exchanged_only,

  -- Users still waiting to migrate
  COUNT(*) FILTER (
    WHERE encrypted_password IS NULL
    AND raw_user_meta_data->'fbuser'->'passwordHash' IS NOT NULL
  ) as pending_password_migration,

  -- OAuth users (don't need password migration)
  COUNT(*) FILTER (
    WHERE raw_app_meta_data->>'provider' != 'email'
  ) as oauth_users,

  -- Migration completion percentage (password users only)
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE encrypted_password IS NOT NULL) /
    NULLIF(COUNT(*) FILTER (WHERE raw_user_meta_data->'fbuser'->'passwordHash' IS NOT NULL), 0),
    2
  ) as migration_completion_pct,

  -- Total sign-ins to Supabase
  COUNT(*) FILTER (
    WHERE last_sign_in_at IS NOT NULL
  ) as users_signed_in_to_supabase
FROM auth.users;


-- ============================================================
-- 2. MIGRATION STATE BREAKDOWN
-- ============================================================
-- This shows the exact migration state of each user group
SELECT
  CASE
    -- Fully migrated (password converted, Firebase data can be cleaned)
    WHEN encrypted_password IS NOT NULL
      AND raw_user_meta_data->'fbuser'->'passwordHash' IS NOT NULL
      THEN '✅ FULLY MIGRATED (Ready for cleanup)'

    -- Fully migrated and cleaned
    WHEN encrypted_password IS NOT NULL
      AND raw_user_meta_data->'fbuser'->'passwordHash' IS NULL
      THEN '✅ FULLY MIGRATED (Cleaned)'

    -- Session exchanged but not fully migrated (AT RISK!)
    WHEN raw_user_meta_data->>'last_firebase_session_exchange' IS NOT NULL
      AND encrypted_password IS NULL
      AND raw_user_meta_data->'fbuser'->'passwordHash' IS NOT NULL
      THEN '⚠️  SESSION EXCHANGED ONLY (Not fully migrated)'

    -- Not migrated, no session exchange
    WHEN encrypted_password IS NULL
      AND raw_user_meta_data->'fbuser'->'passwordHash' IS NOT NULL
      AND (raw_user_meta_data->>'last_firebase_session_exchange' IS NULL
           OR raw_user_meta_data->>'last_firebase_session_exchange' = '')
      THEN '❌ NOT MIGRATED (Waiting for first sign-in)'

    -- OAuth users
    WHEN raw_app_meta_data->>'provider' != 'email'
      THEN '🔐 OAUTH USER (No password to migrate)'

    ELSE '❓ UNKNOWN STATE'
  END as migration_state,
  COUNT(*) as user_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM auth.users
WHERE raw_user_meta_data->'fbuser' IS NOT NULL
   OR encrypted_password IS NOT NULL
GROUP BY migration_state
ORDER BY user_count DESC;


-- ============================================================
-- 3. MIGRATION STATUS BY USER TYPE
-- ============================================================
SELECT
  CASE
    WHEN raw_app_meta_data->>'provider' = 'email' THEN 'Password User'
    WHEN raw_app_meta_data->>'provider' = 'google' THEN 'Google OAuth'
    WHEN raw_app_meta_data->>'provider' = 'apple' THEN 'Apple OAuth'
    WHEN raw_app_meta_data->>'provider' = 'facebook' THEN 'Facebook OAuth'
    ELSE 'Other'
  END as user_type,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE last_sign_in_at IS NOT NULL) as signed_in_to_supabase,
  COUNT(*) FILTER (WHERE encrypted_password IS NOT NULL) as password_migrated
FROM auth.users
GROUP BY user_type
ORDER BY count DESC;


-- ============================================================
-- 4. AT-RISK USERS (Session Exchanged but Not Fully Migrated)
-- ============================================================
-- These users got a Supabase session via session exchange, but their
-- password hasn't been migrated yet. If Firebase auth is turned off,
-- they won't be able to sign in again!
SELECT
  email,
  raw_user_meta_data->'fbuser'->>'uid' as firebase_uid,
  (raw_user_meta_data->>'last_firebase_session_exchange')::timestamp as last_session_exchange,
  AGE(NOW(), (raw_user_meta_data->>'last_firebase_session_exchange')::timestamp) as time_since_exchange,
  last_sign_in_at,
  CASE
    WHEN last_sign_in_at IS NULL THEN 'Never signed in to Supabase'
    WHEN last_sign_in_at < (raw_user_meta_data->>'last_firebase_session_exchange')::timestamp
      THEN 'Last sign-in was before session exchange'
    ELSE 'Signed in after exchange'
  END as sign_in_status
FROM auth.users
WHERE raw_user_meta_data->>'last_firebase_session_exchange' IS NOT NULL
  AND encrypted_password IS NULL
  AND raw_user_meta_data->'fbuser'->'passwordHash' IS NOT NULL
ORDER BY (raw_user_meta_data->>'last_firebase_session_exchange')::timestamp DESC
LIMIT 100;


-- ============================================================
-- 5. RECENT SESSION EXCHANGES (Last 24 hours)
-- ============================================================
SELECT
  email,
  raw_user_meta_data->'fbuser'->>'uid' as firebase_uid,
  raw_user_meta_data->>'last_firebase_session_exchange' as exchange_time,
  last_sign_in_at,
  encrypted_password IS NOT NULL as password_migrated,
  created_at
FROM auth.users
WHERE raw_user_meta_data->>'last_firebase_session_exchange' IS NOT NULL
  AND (raw_user_meta_data->>'last_firebase_session_exchange')::timestamp > NOW() - INTERVAL '24 hours'
ORDER BY (raw_user_meta_data->>'last_firebase_session_exchange')::timestamp DESC
LIMIT 100;


-- ============================================================
-- 6. USERS NEEDING PASSWORD MIGRATION
-- ============================================================
-- These users have Firebase password hashes but haven't migrated yet
SELECT
  email,
  raw_user_meta_data->'fbuser'->>'uid' as firebase_uid,
  created_at,
  last_sign_in_at,
  CASE
    WHEN raw_user_meta_data->'fbuser'->'passwordHash' IS NOT NULL THEN 'Has Firebase Password'
    ELSE 'No Password'
  END as status
FROM auth.users
WHERE encrypted_password IS NULL
  AND raw_user_meta_data->'fbuser'->'passwordHash' IS NOT NULL
LIMIT 100;


-- ============================================================
-- 7. OAUTH USERS (No password needed)
-- ============================================================
SELECT
  raw_app_meta_data->>'provider' as oauth_provider,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE last_sign_in_at IS NOT NULL) as signed_in
FROM auth.users
WHERE raw_app_meta_data->>'provider' != 'email'
GROUP BY oauth_provider;


-- ============================================================
-- 8. MIGRATION TIMELINE (Users migrated per day)
-- ============================================================
SELECT
  DATE(last_sign_in_at) as date,
  COUNT(*) as users_signed_in
FROM auth.users
WHERE last_sign_in_at IS NOT NULL
  AND last_sign_in_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(last_sign_in_at)
ORDER BY date DESC;


-- ============================================================
-- 9. FIND SPECIFIC USER MIGRATION STATUS
-- ============================================================
-- Replace 'user@example.com' with actual email
SELECT
  id,
  email,
  raw_user_meta_data->'fbuser'->>'uid' as firebase_uid,
  raw_app_meta_data->>'provider' as auth_provider,
  CASE
    WHEN encrypted_password IS NOT NULL THEN '✅ Password Migrated'
    WHEN raw_user_meta_data->'fbuser'->'passwordHash' IS NOT NULL THEN '⏳ Pending Migration'
    ELSE '❌ No Password'
  END as password_status,
  CASE
    WHEN raw_user_meta_data->>'last_firebase_session_exchange' IS NOT NULL THEN '✅ Session Exchanged'
    ELSE '❌ Not Exchanged'
  END as session_status,
  last_sign_in_at,
  created_at
FROM auth.users
WHERE email = 'user@example.com';


-- ============================================================
-- 10. USERS WHO HAVEN'T MIGRATED YET
-- ============================================================
-- Users who haven't signed in to Supabase yet
SELECT
  email,
  raw_app_meta_data->>'provider' as auth_provider,
  raw_user_meta_data->'fbuser'->>'uid' as firebase_uid,
  created_at,
  invited_at
FROM auth.users
WHERE last_sign_in_at IS NULL
ORDER BY created_at DESC
LIMIT 100;
