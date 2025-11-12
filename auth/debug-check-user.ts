/**
 * Debug script to check if a user exists in Supabase
 * Usage: node debug-check-user.js <email>
 */

import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2);

if (args.length < 1) {
    console.log('Usage: node debug-check-user.js <email>');
    console.log('  email: the email address to search for');
    process.exit(1);
}

const email = args[0];

// You need to set these environment variables or hardcode them temporarily
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xnpdfycynygjqsmbmapr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
    console.error('   Get it from: Supabase Dashboard → Settings → API → service_role key');
    console.error('   Run: export SUPABASE_SERVICE_ROLE_KEY=your_key_here');
    process.exit(1);
}

async function main() {
    console.log(`🔍 Searching for user: ${email}`);
    console.log(`📍 Supabase URL: ${SUPABASE_URL}`);

    const supabaseAdmin = createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    );

    // List all users and search
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
        console.error('❌ Error listing users:', listError);
        process.exit(1);
    }

    console.log(`\n📊 Total users in Supabase: ${users.length}`);

    // Find user by email
    const user = users.find(u =>
        u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!user) {
        console.log(`\n❌ User NOT found: ${email}`);
        console.log('\n💡 Possible reasons:');
        console.log('   1. You haven\'t imported users from Firebase yet');
        console.log('   2. The email doesn\'t match exactly');
        console.log('   3. The user was imported with a different email');
        console.log('\n📝 Next steps:');
        console.log('   1. Export users from Firebase: node auth/firestoreusers2json.js');
        console.log('   2. Import users to Supabase: node auth/import_users.js users.json');

        // Show first few users for reference
        if (users.length > 0) {
            console.log('\n📋 Sample of existing users (first 5):');
            users.slice(0, 5).forEach((u, i) => {
                console.log(`   ${i + 1}. ${u.email || '(no email)'} - ID: ${u.id}`);
            });
        }

        process.exit(1);
    }

    console.log(`\n✅ User FOUND in Supabase!`);
    console.log(`   Email: ${user.email}`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Email verified: ${user.email_confirmed_at ? 'Yes' : 'No'}`);
    console.log(`   Created: ${user.created_at}`);

    // Check metadata
    console.log(`\n📦 User Metadata:`);
    if (user.user_metadata?.fbuser) {
        console.log(`   ✅ Firebase user data found`);
        console.log(`   Firebase UID: ${user.user_metadata.fbuser.uid || '(missing)'}`);
        console.log(`   Firebase email: ${user.user_metadata.fbuser.email || '(missing)'}`);
        console.log(`   Firebase provider: ${user.user_metadata.fbuser.providerData?.[0]?.providerId || '(unknown)'}`);
    } else {
        console.log(`   ⚠️  No Firebase user data in metadata`);
        console.log(`   This might cause issues with session exchange`);
    }

    console.log(`\n📦 App Metadata:`);
    console.log(`   Provider: ${user.app_metadata?.provider || '(none)'}`);
    console.log(`   Providers: ${user.app_metadata?.providers?.join(', ') || '(none)'}`);

    // Full metadata dump
    console.log(`\n🔍 Full user_metadata:`)
    console.log(JSON.stringify(user.user_metadata, null, 2));
}

main().catch(console.error);
