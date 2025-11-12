// test-token.js
const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function getTestToken() {
  // Use a real user UID from your Firebase
  const uid = 'yya3ihQaRQYfSpcNkPBfUYQnozC2'; // Clare's UID from your example
  const customToken = await admin.auth().createCustomToken(uid);
  console.log('Custom Token:', customToken);
  
  // You'd need to sign in with this on client side to get ID token
  // But for now, let's just verify the service is running
}

getTestToken();