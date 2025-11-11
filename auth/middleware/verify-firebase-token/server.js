const VERSION = '1';
const admin = require('firebase-admin');
const http = require('http');
const app = require("restana")();
const bodyParser = require('body-parser');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const port = process.env.PORT || 3001;

// Initialize Firebase Admin SDK
const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service.json');

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✅ Firebase Admin SDK initialized');
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin SDK:', error);
  process.exit(1);
}

// Health check endpoint
app.get('/', (req, res) => {
  res.send(`verify-firebase-token v${VERSION}`);
});

// Verify Firebase ID token
app.post('/', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    res.statusCode = 400;
    res.send(JSON.stringify({ error: 'Token is required' }));
    return;
  }

  try {
    console.log('Verifying Firebase token...');

    // Verify the ID token
    const decodedToken = await admin.auth().verifyIdToken(token, true);

    console.log('✅ Token verified for user:', decodedToken.uid);

    // Return the decoded token info
    res.statusCode = 200;
    res.send(JSON.stringify({
      uid: decodedToken.uid,
      email: decodedToken.email,
      email_verified: decodedToken.email_verified,
      name: decodedToken.name,
      picture: decodedToken.picture,
      provider: decodedToken.firebase?.sign_in_provider,
      auth_time: decodedToken.auth_time,
      exp: decodedToken.exp,
      iat: decodedToken.iat,
    }));

  } catch (error) {
    console.error('❌ Token verification failed:', error.message);

    // Determine error type
    let statusCode = 401;
    let errorMessage = 'Invalid or expired token';

    if (error.code === 'auth/id-token-expired') {
      errorMessage = 'Token expired';
    } else if (error.code === 'auth/id-token-revoked') {
      errorMessage = 'Token revoked';
    } else if (error.code === 'auth/argument-error') {
      statusCode = 400;
      errorMessage = 'Invalid token format';
    }

    res.statusCode = statusCode;
    res.send(JSON.stringify({
      error: errorMessage,
      code: error.code,
      details: error.message
    }));
  }
});

http.createServer(app).listen(port, '0.0.0.0', function () {
  console.log(`verify-firebase-token app listening on port ${port}!`);
});
