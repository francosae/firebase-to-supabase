-- Check User Metadata Structure
-- Run this in Supabase SQL Editor to see how the user data is stored

-- Find the specific user we're testing
SELECT
  id,
  email,
  created_at,
  -- Check raw_user_meta_data structure
  raw_user_meta_data,
  raw_user_meta_data->'fbuser' as fbuser,
  raw_user_meta_data->'fbuser'->>'uid' as fbuser_uid,
  raw_user_meta_data->'fbuser'->>'email' as fbuser_email,
  -- Check if fields exist
  (raw_user_meta_data->'fbuser'->>'uid' IS NOT NULL) as has_fbuser_uid,
  (raw_user_meta_data->'fbuser' IS NOT NULL) as has_fbuser,
  -- Compare values
  (raw_user_meta_data->'fbuser'->>'uid' = 'yya3ihQaRQYfSpcNkPBfUYQnozC2') as uid_matches,
  (LOWER(email) = LOWER('gino.rey@outlook.com')) as email_matches
FROM auth.users
WHERE email = 'gino.rey@outlook.com'
   OR raw_user_meta_data->'fbuser'->>'uid' = 'yya3ihQaRQYfSpcNkPBfUYQnozC2';

-- Also check all users with similar structure to see if there's a pattern
SELECT
  COUNT(*) as total_users,
  COUNT(raw_user_meta_data->'fbuser') as users_with_fbuser,
  COUNT(raw_user_meta_data->'fbuser'->>'uid') as users_with_fbuser_uid
FROM auth.users;
