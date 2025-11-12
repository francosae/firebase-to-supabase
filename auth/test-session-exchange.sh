#!/bin/bash

# Session Exchange Test Script
# This script helps debug the session exchange process step by step

set -e

echo "🔍 Session Exchange Diagnostic Test"
echo "===================================="
echo ""

# Check environment variables
if [ -z "$FIREBASE_API_KEY" ]; then
    echo "❌ FIREBASE_API_KEY not set"
    echo "   Run: export FIREBASE_API_KEY=your_key"
    exit 1
fi

if [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "❌ SUPABASE_ANON_KEY not set"
    echo "   Run: export SUPABASE_ANON_KEY=your_anon_key"
    exit 1
fi

if [ -z "$FIREBASE_TOKEN_VERIFY_URL" ]; then
    echo "⚠️  FIREBASE_TOKEN_VERIFY_URL not set, using default"
    FIREBASE_TOKEN_VERIFY_URL="https://olive-firebase-token.fly.dev"
fi

SUPABASE_URL="https://xnpdfycynygjqsmbmapr.supabase.co"
USER_UID="${1:-yya3ihQaRQYfSpcNkPBfUYQnozC2}"

echo "📝 Configuration:"
echo "   User UID: $USER_UID"
echo "   Firebase Token Verify: $FIREBASE_TOKEN_VERIFY_URL"
echo "   Supabase URL: $SUPABASE_URL"
echo ""

# Step 1: Generate Firebase ID token
echo "Step 1: Generating Firebase ID token..."
echo "----------------------------------------"
TOKEN_OUTPUT=$(node auth/get-id-token.js "$USER_UID" 2>&1)
echo "$TOKEN_OUTPUT"

# Extract the token (last line that starts with eyJ)
FIREBASE_TOKEN=$(echo "$TOKEN_OUTPUT" | grep "^eyJ" | tail -1)

if [ -z "$FIREBASE_TOKEN" ]; then
    echo ""
    echo "❌ Failed to extract Firebase token"
    exit 1
fi

echo ""
echo "✅ Token extracted (${#FIREBASE_TOKEN} chars)"
echo ""

# Step 2: Test token verification service directly
echo "Step 2: Testing token verification service..."
echo "----------------------------------------------"
VERIFY_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$FIREBASE_TOKEN_VERIFY_URL" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$FIREBASE_TOKEN\"}")

HTTP_STATUS=$(echo "$VERIFY_RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
VERIFY_BODY=$(echo "$VERIFY_RESPONSE" | sed '/HTTP_STATUS:/d')

echo "Status: $HTTP_STATUS"
echo "Response:"
echo "$VERIFY_BODY" | jq '.' 2>/dev/null || echo "$VERIFY_BODY"
echo ""

if [ "$HTTP_STATUS" != "200" ]; then
    echo "❌ Token verification failed"
    exit 1
fi

# Extract user info
USER_ID=$(echo "$VERIFY_BODY" | jq -r '.uid' 2>/dev/null)
USER_EMAIL=$(echo "$VERIFY_BODY" | jq -r '.email' 2>/dev/null)

echo "✅ Token verified successfully"
echo "   UID: $USER_ID"
echo "   Email: $USER_EMAIL"
echo ""

# Step 3: Test session exchange
echo "Step 3: Testing session exchange..."
echo "------------------------------------"
EXCHANGE_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$SUPABASE_URL/functions/v1/exchange-firebase-session" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -d "{\"firebaseToken\":\"$FIREBASE_TOKEN\"}")

HTTP_STATUS=$(echo "$EXCHANGE_RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
EXCHANGE_BODY=$(echo "$EXCHANGE_RESPONSE" | sed '/HTTP_STATUS:/d')

echo "Status: $HTTP_STATUS"
echo "Response:"
echo "$EXCHANGE_BODY" | jq '.' 2>/dev/null || echo "$EXCHANGE_BODY"
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ Session exchange successful!"
    exit 0
else
    echo "❌ Session exchange failed"
    echo ""
    echo "📋 Next steps:"
    echo "1. Check Edge Function logs:"
    echo "   supabase functions logs exchange-firebase-session --project-ref xnpdfycynygjqsmbmapr"
    echo ""
    echo "2. Verify secrets are set:"
    echo "   supabase secrets list --project-ref xnpdfycynygjqsmbmapr"
    echo ""
    echo "3. Expected secrets:"
    echo "   - FIREBASE_TOKEN_VERIFY_URL=$FIREBASE_TOKEN_VERIFY_URL"
    echo "   - SUPABASE_URL=$SUPABASE_URL"
    echo "   - SUPABASE_SERVICE_ROLE_KEY=eyJ... (service_role key)"
    exit 1
fi
