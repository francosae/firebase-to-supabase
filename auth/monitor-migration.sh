#!/bin/bash

# Migration Monitoring Dashboard
# Displays real-time migration progress

set -e

PROJECT_REF="${1:-xnpdfycynygjqsmbmapr}"

echo "🔍 Firebase to Supabase Migration Monitor"
echo "=========================================="
echo "Project: $PROJECT_REF"
echo "Time: $(date)"
echo ""

# Check if supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install: npm install -g supabase"
    exit 1
fi

# Function to run SQL and format output
run_query() {
    local query="$1"
    supabase db query --project-ref "$PROJECT_REF" "$query" 2>&1
}

echo "📊 OVERALL MIGRATION SUMMARY"
echo "----------------------------"
run_query "
SELECT
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE encrypted_password IS NOT NULL) as password_migrated,
  COUNT(*) FILTER (
    WHERE raw_user_meta_data->>'last_firebase_session_exchange' IS NOT NULL
    AND encrypted_password IS NULL
    AND raw_user_meta_data->'fbuser'->'passwordHash' IS NOT NULL
  ) as session_exchanged_only,
  COUNT(*) FILTER (
    WHERE encrypted_password IS NULL
    AND raw_user_meta_data->'fbuser'->'passwordHash' IS NOT NULL
  ) as pending_migration,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE encrypted_password IS NOT NULL) /
    NULLIF(COUNT(*) FILTER (WHERE raw_user_meta_data->'fbuser'->'passwordHash' IS NOT NULL), 0),
    2
  ) as completion_pct
FROM auth.users;
"
echo ""

echo "📈 MIGRATION STATE BREAKDOWN"
echo "----------------------------"
run_query "
SELECT
  CASE
    WHEN encrypted_password IS NOT NULL
      AND raw_user_meta_data->'fbuser'->'passwordHash' IS NOT NULL
      THEN '✅ Fully Migrated'
    WHEN raw_user_meta_data->>'last_firebase_session_exchange' IS NOT NULL
      AND encrypted_password IS NULL
      AND raw_user_meta_data->'fbuser'->'passwordHash' IS NOT NULL
      THEN '⚠️  Session Exchange Only'
    WHEN encrypted_password IS NULL
      AND raw_user_meta_data->'fbuser'->'passwordHash' IS NOT NULL
      THEN '❌ Not Migrated'
    WHEN raw_app_meta_data->>'provider' != 'email'
      THEN '🔐 OAuth User'
    ELSE '❓ Unknown'
  END as state,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct
FROM auth.users
WHERE raw_user_meta_data->'fbuser' IS NOT NULL
   OR encrypted_password IS NOT NULL
GROUP BY state
ORDER BY count DESC;
"
echo ""

echo "⚠️  AT-RISK USERS (Session Exchanged but Not Migrated)"
echo "------------------------------------------------------"
AT_RISK=$(run_query "
SELECT COUNT(*)
FROM auth.users
WHERE raw_user_meta_data->>'last_firebase_session_exchange' IS NOT NULL
  AND encrypted_password IS NULL
  AND raw_user_meta_data->'fbuser'->'passwordHash' IS NOT NULL;
" | tail -1)

if [ "$AT_RISK" -gt 0 ]; then
    echo "⚠️  Warning: $AT_RISK users have session exchanged but not fully migrated"
    echo "   These users will lose access if Firebase auth is turned off!"
    echo ""
    echo "   View details: Run query #4 in auth/check-migration-progress.sql"
else
    echo "✅ No at-risk users"
fi
echo ""

echo "📅 RECENT ACTIVITY (Last 24 hours)"
echo "----------------------------------"
run_query "
SELECT
  COUNT(CASE
    WHEN raw_user_meta_data->>'last_firebase_session_exchange' IS NOT NULL
    AND (raw_user_meta_data->>'last_firebase_session_exchange')::timestamp > NOW() - INTERVAL '24 hours'
    THEN 1
  END) as session_exchanges_24h,
  COUNT(CASE
    WHEN encrypted_password IS NOT NULL
    AND updated_at > NOW() - INTERVAL '24 hours'
    THEN 1
  END) as password_migrations_24h,
  COUNT(CASE
    WHEN last_sign_in_at > NOW() - INTERVAL '24 hours'
    THEN 1
  END) as signins_24h
FROM auth.users;
"
echo ""

echo "💡 Next Steps:"
echo "  1. Full migration progress tracked automatically"
echo "  2. Monitor 'session_exchanged_only' - these users need password migration"
echo "  3. Run: supabase db query --project-ref $PROJECT_REF -f auth/check-migration-progress.sql"
echo "  4. For detailed analysis, open Supabase Dashboard → SQL Editor"
echo ""
echo "🔄 Refresh: ./auth/monitor-migration.sh $PROJECT_REF"
