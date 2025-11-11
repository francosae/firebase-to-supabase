# Complete Firebase to Supabase Auth Migration Guide

This guide covers the complete process of migrating your users from Firebase Auth to Supabase Auth while **preserving passwords** and **minimizing user disruption**.

## 🎯 Overview

This migration solution handles three types of users:

1. **OAuth users** (Google, Apple, Facebook) - Need to re-authenticate via OAuth (one-time)
2. **Password-based users** - Passwords are migrated seamlessly on first login
3. **Anonymous users** - Will need to create new accounts

## ✅ What You've Already Done

Based on your sample data, you've already:

- ✅ Exported users from Firebase (with passwordHash and passwordSalt preserved)
- ✅ Imported users into Supabase (with Firebase data in `raw_user_meta_data.fbuser`)
- ✅ Deployed the password verification middleware

## 🚀 Complete Deployment Steps

### Step 1: Deploy the Password Verification Middleware

This middleware verifies Firebase passwords using the scrypt algorithm.

```bash
cd auth/middleware/verify-firebase-pw

# Install dependencies
npm install

# Configure environment variables
cp local.env.sh.sample local.env.sh

# Edit local.env.sh with your Firebase password hash parameters
nano local.env.sh
```

Edit `local.env.sh`:
```bash
export PORT=3000
export MEMCOST=14                    # From Firebase Console
export ROUNDS=8                      # From Firebase Console
export SALTSEPARATOR=Aa==            # From Firebase Console
export SIGNERKEY=YOUR_SIGNER_KEY==   # From Firebase Console
```

#### Option A: Deploy to Fly.io (Recommended)

```bash
# Install flyctl if you haven't already
curl -L https://fly.io/install.sh | sh

# Login to fly.io
flyctl auth login

# Configure fly.toml
cp fly.toml.sample fly.toml
nano fly.toml  # Update the [env] section with your hash parameters

# Launch and deploy
flyctl launch
flyctl deploy

# Note your deployment URL (e.g., https://your-app.fly.dev)
```

#### Option B: Deploy Locally (Development Only)

```bash
# Run locally
./local.sh

# Test it
curl http://localhost:3000
# Should return: verify-firebase-pw v7
```

### Step 2: Deploy the Supabase Edge Function

This Edge Function handles password migration seamlessly.

```bash
# Install Supabase CLI if you haven't already
npm install -g supabase

# Login to Supabase
supabase login

# Link to your Supabase project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the Edge Function
cd auth/supabase-functions
supabase functions deploy migrate-firebase-password

# Set environment variables (secrets)
supabase secrets set FIREBASE_PW_VERIFY_URL=https://your-app.fly.dev
supabase secrets set SUPABASE_URL=https://your-project.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
supabase secrets set SUPABASE_ANON_KEY=your_anon_key
```

**Get your secrets from:**
- `FIREBASE_PW_VERIFY_URL`: Your fly.io deployment URL from Step 1
- `SUPABASE_URL`: Supabase Dashboard → Settings → API → Project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase Dashboard → Settings → API → service_role key
- `SUPABASE_ANON_KEY`: Supabase Dashboard → Settings → API → anon public key

### Step 3: Configure Supabase OAuth Providers

For users who signed up with Google, Apple, or Facebook:

1. Go to Supabase Dashboard → Authentication → Providers
2. **Enable Google OAuth:**
   - Use the same Google Client ID from your Firebase project
   - Add authorized redirect URL: `https://your-project.supabase.co/auth/v1/callback`
3. **Enable Apple OAuth:**
   - Use the same Apple credentials from your Firebase project
   - Add authorized redirect URL: `https://your-project.supabase.co/auth/v1/callback`
4. **Enable Facebook OAuth** (if applicable)

### Step 4: Update Your React Native App

#### Install Dependencies

```bash
npm install @supabase/supabase-js
npm install @react-native-async-storage/async-storage
```

#### Copy the Auth Migration Helpers

Copy these files to your React Native project:
- `auth/react-native-helpers/authMigration.ts`
- `auth/react-native-helpers/ExampleLoginScreen.tsx` (as reference)

#### Configure Supabase Client

Edit `authMigration.ts`:

```typescript
const supabaseUrl = 'https://your-project.supabase.co';
const supabaseAnonKey = 'your-anon-key';
```

#### Update Your Login Flow

Replace your existing Firebase login code with the new migration-aware code:

```typescript
import {
  signInWithPassword,
  signInWithOAuth,
  checkMigrationStatus,
} from './path/to/authMigration';

// For password-based login
async function handleLogin(email: string, password: string) {
  const { data, error, migrated } = await signInWithPassword(email, password);

  if (data.session) {
    if (migrated) {
      console.log('✅ Password migrated successfully!');
    }
    // Navigate to main app
  } else {
    console.error('Login failed:', error);
  }
}

// For OAuth login
async function handleGoogleLogin() {
  const { data, error } = await signInWithOAuth('google');
  // OAuth flow will open automatically
}
```

#### Check Migration Status on App Start

In your main App component:

```typescript
useEffect(() => {
  checkInitialAuthState();
}, []);

async function checkInitialAuthState() {
  const { needsMigration, hasSupabaseSession } = await checkMigrationStatus();

  if (hasSupabaseSession) {
    // User already logged in, go to main app
    navigation.navigate('Home');
  } else if (needsMigration) {
    // Show login screen with migration message
    showMigrationBanner();
  }
}
```

### Step 5: Remove Firebase SDK (Optional)

Once you've confirmed all users have migrated, you can remove Firebase:

```bash
npm uninstall firebase
# Remove Firebase imports from your code
```

## 🧪 Testing the Migration

### Test Password-Based User

```bash
# Using curl
curl -X POST https://your-project.supabase.co/functions/v1/migrate-firebase-password \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{"email":"clarehutchinson8@gmail.com","password":"their_actual_password"}'

# Should return:
# {
#   "session": {...},
#   "migrated": true,
#   "message": "Password successfully migrated and logged in"
# }
```

### Test OAuth User

1. Open your app
2. Click "Sign in with Google"
3. Complete OAuth flow
4. User should be automatically linked to their migrated account by email

## 📊 Migration Flow Diagram

```
Password User Login Flow:
┌─────────────────────────────────────────────────────────────┐
│ User enters email/password                                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Try Supabase login first                                    │
│ (in case password already migrated)                         │
└────────────────────┬────────────────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          │                     │
          ▼                     ▼
    ┌─────────┐           ┌──────────┐
    │ Success │           │  Failed  │
    └────┬────┘           └────┬─────┘
         │                     │
         │                     ▼
         │          ┌──────────────────────────────┐
         │          │ Call Edge Function to:       │
         │          │ 1. Get Firebase hash/salt    │
         │          │ 2. Verify with middleware    │
         │          │ 3. Update Supabase password  │
         │          │ 4. Return session            │
         │          └─────────────┬────────────────┘
         │                        │
         │                        ▼
         │                  ┌──────────┐
         │                  │ Success  │
         │                  └────┬─────┘
         │                       │
         └───────────────────────┘
                                 │
                                 ▼
                     ┌─────────────────────┐
                     │ User logged in      │
                     │ Password migrated   │
                     └─────────────────────┘
```

```
OAuth User Login Flow:
┌─────────────────────────────────────────────────────────────┐
│ User clicks "Sign in with Google/Apple"                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Supabase OAuth flow opens                                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ User authenticates with OAuth provider                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Supabase links to existing account by email                 │
│ Returns session                                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
         ┌─────────────────────┐
         │ User logged in      │
         └─────────────────────┘
```

## 🔒 Security Considerations

1. **Password hashes are stored in `raw_user_meta_data`**: This is acceptable because:
   - They're Firebase-specific hashes (can't be used directly)
   - They're deleted after migration (optional - see cleanup below)
   - Only the service_role key can access them

2. **The middleware URL should be secured**: Your Fly.io deployment should use HTTPS

3. **Rate limiting**: Consider adding rate limiting to the Edge Function to prevent brute force attacks

## 🧹 Post-Migration Cleanup (Optional)

After all users have migrated, you can remove the Firebase password hashes:

```sql
-- Run in Supabase SQL Editor
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data - 'fbuser'
WHERE raw_user_meta_data->'fbuser'->'passwordHash' IS NOT NULL
AND encrypted_password IS NOT NULL;
```

This removes the Firebase data from users who have successfully migrated their passwords.

## 📱 User Communication

Consider sending an email to your users:

**Subject:** Important: Security Upgrade - Please Sign In Again

**Body:**
```
Hi [Name],

We've upgraded to a more secure authentication system to better protect your account.

When you next open the app, you'll need to sign in again:
- If you use Google/Apple: Simply sign in with the same account
- If you use email/password: Use your existing password (it will work!)

Your data is safe and this is a one-time requirement.

Thanks for your patience!
```

## ❓ Troubleshooting

### Edge Function Returns "Password verification service not configured"

- Check that `FIREBASE_PW_VERIFY_URL` secret is set correctly
- Test the middleware URL directly: `curl https://your-app.fly.dev`

### Password verification fails for known-good passwords

- Verify Firebase hash parameters in middleware
- Check Firebase Console → Authentication → Users → Password hash parameters (⋮ menu)
- Ensure `MEMCOST`, `ROUNDS`, `SALTSEPARATOR`, and `SIGNERKEY` match exactly

### OAuth users can't sign in

- Verify OAuth providers are enabled in Supabase
- Check redirect URLs match your app's deep linking configuration
- For Apple: Verify Services ID is configured correctly

### Users get "User not found" error

- Verify users were imported successfully: Check Supabase Dashboard → Authentication → Users
- Check email matches exactly (case-sensitive)

## 📈 Monitoring Migration Progress

Track migration progress with this SQL query:

```sql
-- Run in Supabase SQL Editor
SELECT
  COUNT(*) FILTER (WHERE encrypted_password IS NOT NULL) as migrated_passwords,
  COUNT(*) FILTER (WHERE encrypted_password IS NULL AND raw_user_meta_data->'fbuser'->'passwordHash' IS NOT NULL) as pending_password_migration,
  COUNT(*) FILTER (WHERE raw_app_meta_data->>'provider' != 'email') as oauth_users,
  COUNT(*) as total_users
FROM auth.users;
```

## ✅ Success Criteria

Your migration is complete when:

- [ ] Password verification middleware is deployed and responding
- [ ] Supabase Edge Function is deployed with correct secrets
- [ ] OAuth providers are configured in Supabase
- [ ] React Native app is updated with migration helpers
- [ ] Test users can successfully log in (both password and OAuth)
- [ ] Production app is deployed
- [ ] Users are successfully migrating (monitor with SQL query above)

## 🎉 Next Steps

Once migration is complete:

1. Monitor error rates for auth-related issues
2. Gradually remove Firebase SDK from your codebase
3. Clean up Firebase password hashes from `raw_user_meta_data` (optional)
4. Decommission Firebase project (after grace period)

---

Need help? Check the troubleshooting section or open an issue in the repository.
