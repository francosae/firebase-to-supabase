#!/bin/bash

# Deploy Exchange Firebase Session Edge Function
# This script deploys the updated edge function with debugging to Supabase

set -e

echo "🚀 Deploying exchange-firebase-session Edge Function"
echo "===================================================="
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found"
    echo "   Install it: npm install -g supabase"
    exit 1
fi

# Ensure the function is in the right directory
echo "📦 Preparing function for deployment..."
mkdir -p ../supabase/functions/exchange-firebase-session
cp supabase-functions/exchange-firebase-session/index.ts ../supabase/functions/exchange-firebase-session/

echo "✅ Function prepared"
echo ""

# Get project ref from user or use default
PROJECT_REF="${1:-xnpdfycynygjqsmbmapr}"

echo "📤 Deploying to project: $PROJECT_REF"
echo ""

# Deploy
cd ..
supabase functions deploy exchange-firebase-session --project-ref "$PROJECT_REF"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Test the function again with your curl command"
    echo "2. Check logs for detailed debugging:"
    echo "   supabase functions logs exchange-firebase-session --project-ref $PROJECT_REF"
    echo ""
    echo "The function now includes detailed debugging that will show:"
    echo "  - Firebase user data received"
    echo "  - User lookup process"
    echo "  - Why the match failed (if it does)"
else
    echo ""
    echo "❌ Deployment failed"
    echo "   Check the error message above"
    exit 1
fi
