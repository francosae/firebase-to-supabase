# Firebase Token Verification Service

This service validates Firebase ID tokens using the Firebase Admin SDK. It's used for **session exchange** - validating active Firebase sessions and exchanging them for Supabase sessions.

## Purpose

- Validates Firebase ID tokens (JWT)
- Returns decoded user information
- Enables session exchange without requiring users to sign out
- Complements the password verification middleware

## How It Works

```
Client sends Firebase ID token
         ↓
This service validates with Firebase Admin SDK
         ↓
Returns user info (uid, email, etc.)
         ↓
Edge Function uses this to issue Supabase session
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Add Firebase Service Account

Copy your `firebase-service.json` file to this directory:

```bash
cp /path/to/firebase-service.json ./
```

### 3. Deploy to Fly.io

```bash
# Launch (first time only)
flyctl launch --name your-app-firebase-token

# Deploy
flyctl deploy

# Test
curl https://your-app-firebase-token.fly.dev
# Should return: verify-firebase-token v1
```

## API

### GET /

Health check endpoint.

**Response:**
```
verify-firebase-token v1
```

### POST /

Verify Firebase ID token.

**Request:**
```json
{
  "token": "eyJhbGciOiJSUzI1NiIsIm..."
}
```

**Success Response (200):**
```json
{
  "uid": "user123",
  "email": "user@example.com",
  "email_verified": true,
  "name": "John Doe",
  "picture": "https://...",
  "provider": "google.com",
  "auth_time": 1234567890,
  "exp": 1234571490,
  "iat": 1234567890
}
```

**Error Response (401):**
```json
{
  "error": "Invalid or expired token",
  "code": "auth/id-token-expired",
  "details": "..."
}
```

## Testing

### Get a Firebase ID Token

In your React Native app:

```javascript
const token = await firebase.auth().currentUser.getIdToken();
console.log('Token:', token);
```

### Test the Service

```bash
curl -X POST https://your-app-firebase-token.fly.dev \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR_FIREBASE_TOKEN"}'
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Port to listen on | 3001 |
| FIREBASE_SERVICE_ACCOUNT_PATH | Path to firebase-service.json | ./firebase-service.json |

## Error Codes

| Code | Meaning |
|------|---------|
| `auth/id-token-expired` | Token has expired (usually after 1 hour) |
| `auth/id-token-revoked` | Token has been revoked |
| `auth/argument-error` | Invalid token format |

## Security

- Tokens are validated using Firebase Admin SDK (same as Firebase does)
- Tokens are cryptographically signed by Firebase
- Expired tokens are automatically rejected
- No tokens are stored or logged

## Differences from Password Verification Middleware

| Feature | Token Verification | Password Verification |
|---------|-------------------|----------------------|
| Purpose | Validate active sessions | Verify passwords |
| Input | Firebase ID token | Email + password + hash + salt |
| Output | User info | valid/invalid |
| When | App startup | User signs in with password |
| Port | 3001 | 3000 |
