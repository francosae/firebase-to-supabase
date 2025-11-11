# Quick Start: Password-Preserving Migration

**Goal:** Migrate users from Firebase to Supabase while preserving passwords and sessions.

## Prerequisites

- ✅ Users already exported from Firebase
- ✅ Users already imported to Supabase
- ✅ Firebase password hash parameters from Firebase Console

## 5-Minute Setup

### 1. Deploy Password Verification Middleware (2 min)

```bash
cd auth/middleware/verify-firebase-pw
npm install

# Copy and edit environment config
cp local.env.sh.sample local.env.sh
# Add your Firebase hash parameters: MEMCOST, ROUNDS, SALTSEPARATOR, SIGNERKEY

# Deploy to Fly.io
flyctl launch
flyctl deploy

# Save your URL: https://your-app.fly.dev
```

### 2. Deploy Supabase Edge Function (2 min)

```bash
cd auth/supabase-functions

# Deploy function
supabase functions deploy migrate-firebase-password

# Set secrets
supabase secrets set FIREBASE_PW_VERIFY_URL=https://your-app.fly.dev
supabase secrets set SUPABASE_URL=https://your-project.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
supabase secrets set SUPABASE_ANON_KEY=your_anon_key
```

### 3. Configure OAuth (1 min)

Supabase Dashboard → Authentication → Providers:
- ✅ Enable Google (use same Client ID as Firebase)
- ✅ Enable Apple (use same credentials as Firebase)

### 4. Update React Native App

Copy `auth/react-native-helpers/authMigration.ts` to your project.

Replace login code:

```typescript
import { signInWithPassword, signInWithOAuth } from './authMigration';

// Password login
const { data, error, migrated } = await signInWithPassword(email, password);

// OAuth login
const { data, error } = await signInWithOAuth('google');
```

## Test It

```bash
# Test password migration
curl -X POST https://your-project.supabase.co/functions/v1/migrate-firebase-password \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{"email":"test@example.com","password":"testpassword"}'

# Should return: {"session":{...},"migrated":true}
```

## That's It! 🎉

- Password users: Passwords migrate automatically on first login
- OAuth users: Re-authenticate once with Google/Apple
- Zero password resets required

**Full details:** See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)
