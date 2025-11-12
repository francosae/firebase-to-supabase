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

  // Step 1: Create custom token
  const customToken = await admin.auth().createCustomToken(uid);
  console.log('✅ Custom token created');

  // Step 2: Exchange custom token for ID token using Firebase REST API
  console.log('🔄 Exchanging custom token for ID token...');

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
    console.error('❌ Error:', data.error);
    throw new Error(data.error.message);
  }

  console.log('✅ ID token obtained!');
  console.log('\n📋 Token Details:');
  console.log('- User ID:', data.localId);
  console.log('- Email:', data.email || 'N/A');
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
