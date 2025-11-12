# Session Exchange Troubleshooting Guide

## Problem: "User not found" when testing session exchange

This error means either:
1. The user hasn't been imported to Supabase yet
2. The Firebase token doesn't contain valid user data
3. The email/UID doesn't match between Firebase and Supabase

## Step-by-Step Fix

### Step 1: Verify Firebase API Key is Set

When running `get-id-token.js`, you need your Firebase Web API Key:

```bash
# Get it from: Firebase Console > Project Settings > General > Web API Key
export FIREBASE_API_KEY=AIza...your_key_here

# Then run the token generator
node auth/get-id-token.js <USER_UID>
```

**Expected output (good):**
```
📝 Creating custom token for UID: yya3ihQaRQYfSpcNkPBfUYQnozC2
✅ Custom token created
🔄 Exchanging custom token for ID token...
✅ ID token obtained!

📋 Token Details:
- User ID: yya3ihQaRQYfSpcNkPBfUYQnozC2    <-- Should NOT be undefined
- Email: gino.rey@outlook.com               <-- Should have email
- Expires in: 3600 seconds
```

**Bad output (problem):**
```
📋 Token Details:
- User ID: undefined     <-- PROBLEM!
- Email: N/A            <-- PROBLEM!
```

### Step 2: Verify User is Imported to Supabase

Check if the user exists in Supabase:

```bash
# Get your Supabase service_role key from:
# Supabase Dashboard → Settings → API → service_role key

export SUPABASE_SERVICE_ROLE_KEY=eyJ...your_key_here

# Run the debug script
node auth/debug-check-user.js gino.rey@outlook.com
```

**Expected output (good):**
```
✅ User FOUND in Supabase!
   Email: gino.rey@outlook.com
   ID: abc123...
   ✅ Firebase user data found
   Firebase UID: yya3ihQaRQYfSpcNkPBfUYQnozC2
```

**Bad output (problem):**
```
❌ User NOT found: gino.rey@outlook.com

💡 Next steps:
   1. Export users from Firebase: node auth/firestoreusers2json.js
   2. Import users to Supabase: node auth/import_users.js users.json
```

### Step 3: If User Not Found, Import Users

```bash
cd auth

# Step 1: Export users from Firebase
node firestoreusers2json.js users.json

# Step 2: Check the export worked
head -20 users.json

# Step 3: Import to Supabase
# First, set up supabase-service.json (PostgreSQL credentials)
# See auth/README.md for instructions

node import_users.js users.json
```

### Step 4: Verify Edge Function Configuration

Check that the edge function has the right environment variables:

```bash
# Check secrets are set
supabase secrets list

# Should show:
# - FIREBASE_TOKEN_VERIFY_URL
# - SUPABASE_URL
# - SUPABASE_SERVICE_ROLE_KEY
# - SUPABASE_ANON_KEY (if using)
```

If missing, set them:

```bash
supabase secrets set FIREBASE_TOKEN_VERIFY_URL=https://your-app-firebase-token.fly.dev
supabase secrets set SUPABASE_URL=https://your-project.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Step 5: Test Again

```bash
# Generate token WITH API key set
export FIREBASE_API_KEY=AIza...
node auth/get-id-token.js yya3ihQaRQYfSpcNkPBfUYQnozC2

# Copy the token and test
curl -X POST https://xnpdfycynygjqsmbmapr.supabase.co/functions/v1/exchange-firebase-session \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"firebaseToken":"PASTE_TOKEN_HERE"}'
```

**Expected success:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "...",
  "user": {
    "id": "...",
    "email": "gino.rey@outlook.com"
  },
  "exchanged": true,
  "message": "Firebase session successfully exchanged for Supabase session"
}
```

## Common Issues

### Issue 1: "FIREBASE_API_KEY not set"

**Fix:** Get your Web API Key from Firebase Console > Project Settings > General

### Issue 2: "User ID: undefined"

**Cause:** Missing or invalid FIREBASE_API_KEY
**Fix:** Set the correct API key as environment variable

### Issue 3: "User not found"

**Cause:** User not imported to Supabase, or email mismatch
**Fix:** Run the import process or check email matches exactly

### Issue 4: "FIREBASE_TOKEN_VERIFY_URL not configured"

**Cause:** Edge function secrets not set
**Fix:** Run `supabase secrets set` commands from Step 4

### Issue 5: Custom token works but session exchange fails

**Possible causes:**
- User metadata doesn't have `fbuser.uid`
- Email doesn't match exactly (case sensitive)
- User imported before metadata structure was finalized

**Fix:** Re-import users or update metadata manually

## Still Having Issues?

Run the full diagnostic:

```bash
# 1. Check Firebase token generation
export FIREBASE_API_KEY=your_key
node auth/get-id-token.js YOUR_UID

# 2. Check user exists in Supabase
export SUPABASE_SERVICE_ROLE_KEY=your_key
node auth/debug-check-user.js your@email.com

# 3. Check edge function logs
supabase functions logs exchange-firebase-session

# 4. Check the user metadata directly in Supabase
# In Supabase SQL Editor:
SELECT
  email,
  raw_user_meta_data->'fbuser'->>'uid' as firebase_uid,
  raw_user_meta_data->'fbuser'->>'email' as firebase_email
FROM auth.users
WHERE email = 'your@email.com';
```
