/**
 * Decode JWT token to see what's inside
 * Usage: node decode-token.js <token>
 */

const token = process.argv[2];

if (!token) {
  console.log('Usage: node decode-token.js <token>');
  console.log('\nExample:');
  console.log('  node decode-token.js eyJhbGciOiJSUzI1NiIsImtpZCI6IjM4MDI5...');
  process.exit(1);
}

try {
  // JWT tokens are: header.payload.signature
  const parts = token.split('.');

  if (parts.length !== 3) {
    console.error('❌ Invalid JWT token format (should have 3 parts separated by dots)');
    process.exit(1);
  }

  // Decode header
  const header = JSON.parse(Buffer.from(parts[0], 'base64').toString('utf8'));

  // Decode payload
  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));

  console.log('🔍 JWT Token Decoded:\n');

  console.log('📋 Header:');
  console.log(JSON.stringify(header, null, 2));

  console.log('\n📦 Payload:');
  console.log(JSON.stringify(payload, null, 2));

  console.log('\n✅ Key Fields:');
  console.log('- User ID (sub):', payload.sub || '❌ MISSING');
  console.log('- User ID (user_id):', payload.user_id || '❌ MISSING');
  console.log('- Email:', payload.email || '❌ MISSING');
  console.log('- Email Verified:', payload.email_verified ?? '❌ MISSING');
  console.log('- Issuer:', payload.iss || '❌ MISSING');
  console.log('- Audience:', payload.aud || '❌ MISSING');
  console.log('- Issued At:', payload.iat ? new Date(payload.iat * 1000).toISOString() : '❌ MISSING');
  console.log('- Expires At:', payload.exp ? new Date(payload.exp * 1000).toISOString() : '❌ MISSING');

  // Check if expired
  if (payload.exp) {
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      console.log('\n⚠️  TOKEN EXPIRED!');
      console.log(`   Expired ${Math.floor((now - payload.exp) / 60)} minutes ago`);
    } else {
      console.log(`\n✅ Token valid for ${Math.floor((payload.exp - now) / 60)} more minutes`);
    }
  }

  // Check Firebase-specific fields
  console.log('\n🔥 Firebase Fields:');
  if (payload.firebase) {
    console.log('- Sign-in Provider:', payload.firebase.sign_in_provider || '❌ MISSING');
    console.log('- Identities:', JSON.stringify(payload.firebase.identities || {}, null, 2));
  } else {
    console.log('⚠️  No Firebase fields found (this might be the issue!)');
  }

} catch (error) {
  console.error('❌ Failed to decode token:', error.message);
  console.error('\nMake sure you\'re pasting the complete token.');
  process.exit(1);
}
