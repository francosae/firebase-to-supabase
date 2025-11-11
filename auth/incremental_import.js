/**
 * Incremental User Import Script
 * Only imports users created after a specific timestamp
 * Run this periodically during your migration period
 */

const admin = require("firebase-admin");
const fs = require('fs');
const { Client } = require('pg');

const serviceAccount = require("./firebase-service.json");

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
  });
} catch (e) {
  console.log('Firebase already initialized');
}

const args = process.argv.slice(2);

if (args.length < 1) {
  console.log('Usage: node incremental_import.js <since_timestamp> [<batch_size>]');
  console.log('  since_timestamp: ISO timestamp (e.g., "2025-11-10T00:00:00Z") - only import users created after this time');
  console.log('  batch_size: (optional) number of users to process in a batch (defaults to 100)');
  console.log('');
  console.log('Example: node incremental_import.js "2025-11-10T15:30:00Z" 100');
  process.exit(1);
}

const sinceTimestamp = new Date(args[0]);
const BATCH_SIZE = parseInt(args[1], 10) || 100;

console.log(`Importing users created since: ${sinceTimestamp.toISOString()}`);

let pgCreds;
try {
  pgCreds = JSON.parse(fs.readFileSync('./supabase-service.json', 'utf8'));
} catch (err) {
  console.log('error reading supabase-service.json', err);
  process.exit(1);
}

let client;
let importedCount = 0;
let skippedCount = 0;

async function main() {
  client = new Client({
    user: pgCreds.user,
    host: pgCreds.host,
    database: pgCreds.database,
    password: pgCreds.password,
    port: pgCreds.port
  });
  await client.connect();

  console.log('Fetching Firebase users...');
  await listAndImportUsers();

  console.log(`\nImport complete!`);
  console.log(`Imported: ${importedCount} new users`);
  console.log(`Skipped: ${skippedCount} users (created before ${sinceTimestamp.toISOString()})`);

  client.end();
  process.exit(0);
}

async function listAndImportUsers(nextPageToken) {
  const listUsersResult = await admin.auth().listUsers(1000, nextPageToken);

  for (const user of listUsersResult.users) {
    const creationTime = new Date(user.metadata.creationTime);

    if (creationTime >= sinceTimestamp) {
      // This user was created after our cutoff time - import them
      try {
        await importUser(user);
        importedCount++;
        if (importedCount % 10 === 0) {
          console.log(`Imported ${importedCount} new users...`);
        }
      } catch (err) {
        console.error(`Failed to import user ${user.email}:`, err.message);
      }
    } else {
      skippedCount++;
    }
  }

  if (listUsersResult.pageToken) {
    await listAndImportUsers(listUsersResult.pageToken);
  }
}

async function importUser(user) {
  const escapedEmail = user.email ? user.email.replace(/'/g, "''") : '';
  const escapedUserJson = JSON.stringify(user).replace(/'/g, "''");
  const escapedProviderString = getProviderString(user.providerData).replace(/'/g, "''");

  const sql = `
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at,
      recovery_token, recovery_sent_at, email_change_token_new, email_change,
      email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, created_at, updated_at, phone, phone_confirmed_at,
      phone_change, phone_change_token, phone_change_sent_at,
      email_change_token_current, email_change_confirm_status
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      uuid_generate_v4(),
      'authenticated',
      'authenticated',
      '${escapedEmail}',
      null,
      ${user.emailVerified ? 'NOW()' : 'null'},
      '${new Date(user.metadata.creationTime).toISOString()}',
      '', null, '', null, '', '', null, null,
      '${escapedProviderString}',
      '{"fbuser":${escapedUserJson}}',
      false,
      NOW(),
      NOW(),
      null, null, '', '', null, '', 0
    )
    ON CONFLICT (email) DO NOTHING;
  `;

  await client.query(sql);
}

function getProviderString(providerData) {
  const providers = [];
  for (let i = 0; i < providerData.length; i++) {
    const p = providerData[i].providerId.toLowerCase().replace('.com', '');
    let provider = 'email';
    switch (p) {
      case 'password':
        provider = 'email';
        break;
      case 'google':
        provider = 'google';
        break;
      case 'facebook':
        provider = 'facebook';
        break;
      case 'apple':
        provider = 'apple';
        break;
    }
    providers.push(provider);
  }
  return `{"provider": "${providers[0]}","providers":["${providers.join('","')}"]}`;
}

main();
