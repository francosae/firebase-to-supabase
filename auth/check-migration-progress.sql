-- Migration Progress Tracking Queries
-- Run these in Supabase SQL Editor to monitor your migration

-- ============================================================
-- 1. OVERALL MIGRATION SUMMARY
-- ============================================================
SELECT
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE encrypted_password IS NOT NULL) as password_migrated,
  COUNT(*) FILTER (
    WHERE encrypted_password IS NULL
    AND raw_user_meta_data->'fbuser'->'passwordHash' IS NOT NULL
  ) as pending_password_migration,
  COUNT(*) FILTER (
    WHERE raw_app_meta_data->>'provider' != 'email'
  ) as oauth_users,
  COUNT(*) FILTER (
    WHERE raw_user_meta_data->>'last_firebase_session_exchange' IS NOT NULL
  ) as session_exchanged,
  COUNT(*) FILTER (
    WHERE last_sign_in_at IS NOT NULL
  ) as users_signed_in_to_supabase
FROM auth.users;


-- ============================================================
-- 2. MIGRATION STATUS BY USER TYPE
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
-- 3. RECENT SESSION EXCHANGES (Last 24 hours)
-- ============================================================
SELECT
  email,
  raw_user_meta_data->'fbuser'->>'uid' as firebase_uid,
  raw_user_meta_data->>'last_firebase_session_exchange' as exchange_time,
  last_sign_in_at,
  created_at
FROM auth.users
WHERE raw_user_meta_data->>'last_firebase_session_exchange' IS NOT NULL
  AND (raw_user_meta_data->>'last_firebase_session_exchange')::timestamp > NOW() - INTERVAL '24 hours'
ORDER BY (raw_user_meta_data->>'last_firebase_session_exchange')::timestamp DESC
LIMIT 100;


-- ============================================================
-- 4. USERS NEEDING PASSWORD MIGRATION
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
-- 5. OAUTH USERS (No password needed)
-- ============================================================
SELECT
  raw_app_meta_data->>'provider' as oauth_provider,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE last_sign_in_at IS NOT NULL) as signed_in
FROM auth.users
WHERE raw_app_meta_data->>'provider' != 'email'
GROUP BY oauth_provider;


-- ============================================================
-- 6. MIGRATION TIMELINE (Users migrated per day)
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
-- 7. FIND SPECIFIC USER MIGRATION STATUS
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
-- 8. USERS WHO HAVEN'T MIGRATED YET
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
