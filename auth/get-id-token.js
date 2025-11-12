/**
 * Get Firebase ID Token from Custom Token
 *
 * This script:
 * 1. Creates a custom token for a user
 * 2. Signs in with that custom token (client-side)
 * 3. Gets the ID token from the authenticated session
 */

const admin = require('firebase-admin');
const fetch = require('node-fetch');

const serviceAccount = require('./firebase-service.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Get your Firebase API key from Firebase Console > Project Settings > General
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'YOUR_FIREBASE_API_KEY';
const FIREBASE_PROJECT_ID = serviceAccount.project_id;

async function getIdToken(uid) {
  console.log('📝 Creating custom token for UID:', uid);

  // Step 0: Verify user exists in Firebase first
  try {
    const userRecord = await admin.auth().getUser(uid);
    console.log('✅ User found in Firebase:');
    console.log('   - UID:', userRecord.uid);
    console.log('   - Email:', userRecord.email || '(no email)');
    console.log('   - Disabled:', userRecord.disabled);
    console.log('   - Email Verified:', userRecord.emailVerified);
  } catch (error) {
    console.error('❌ User NOT found in Firebase Auth!');
    console.error('   Error:', error.message);
    console.error('\n💡 This user may have been deleted from Firebase.');
    console.error('   The custom token will be created but won\'t contain user data.');
    console.error('   Consider using a UID of a user that still exists in Firebase.\n');
    // Continue anyway to demonstrate the issue
  }

  // Step 1: Create custom token
  const customToken = await admin.auth().createCustomToken(uid);
  console.log('✅ Custom token created');

  // Step 2: Exchange custom token for ID token using Firebase REST API
  console.log('🔄 Exchanging custom token for ID token...');
  console.log('   API Key:', FIREBASE_API_KEY.substring(0, 10) + '...');
  console.log('   Project:', FIREBASE_PROJECT_ID);

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: customToken,
        returnSecureToken: true
      })
    }
  );

  const data = await response.json();

  if (data.error) {
    console.error('❌ Error from Firebase REST API:', data.error);
    console.error('\n💡 Common causes:');
    console.error('   - Invalid FIREBASE_API_KEY');
    console.error('   - User deleted from Firebase Auth');
    console.error('   - Firebase project configuration issue');
    throw new Error(data.error.message);
  }

  console.log('✅ ID token obtained!');

  // Decode the token to extract user data (it's in the JWT, not in the response fields)
  const tokenParts = data.idToken.split('.');
  const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString('utf8'));

  console.log('\n📋 Token Details (decoded from JWT):');
  console.log('- User ID:', payload.user_id || payload.sub || '❌ MISSING');
  console.log('- Email:', payload.email || '❌ MISSING');
  console.log('- Email Verified:', payload.email_verified ?? 'N/A');
  console.log('- Expires in:', data.expiresIn, 'seconds (usually 3600 = 1 hour)');

  console.log('\n🎫 ID Token:');
  console.log(data.idToken);
  console.log('\n');

  return {
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn,
    localId: data.localId
  };
}

// Get UID from command line argument
const uid = process.argv[2];

if (!uid) {
  console.log('Usage: node get-id-token.js <USER_UID>');
  console.log('\nExample:');
  console.log('  node get-id-token.js yya3ihQaRQYfSpcNkPBfUYQnozC2');
  console.log('\nYou can find user UIDs in:');
  console.log('  - Firebase Console > Authentication > Users');
  console.log('  - Your Supabase database: SELECT raw_user_meta_data->\'fbuser\'->\'uid\' FROM auth.users;');
  process.exit(1);
}

if (!FIREBASE_API_KEY || FIREBASE_API_KEY === 'YOUR_FIREBASE_API_KEY') {
  console.error('❌ Error: FIREBASE_API_KEY not set');
  console.log('\nGet your API key from:');
  console.log('Firebase Console > Project Settings > General > Web API Key');
  console.log('\nThen either:');
  console.log('1. Set environment variable: export FIREBASE_API_KEY=your_key');
  console.log('2. Or edit this script and replace YOUR_FIREBASE_API_KEY');
  process.exit(1);
}

getIdToken(uid)
  .then(() => {
    console.log('✅ Done! Copy the ID token above to test your endpoints.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error.message);
    process.exit(1);
  });
