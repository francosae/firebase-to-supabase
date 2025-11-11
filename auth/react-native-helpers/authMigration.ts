/**
 * Firebase to Supabase Authentication Migration Helpers for React Native
 *
 * This file contains helper functions for migrating users from Firebase Auth to Supabase Auth
 * while preserving passwords and providing a seamless experience.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Initialize your Supabase client
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const MIGRATION_STORAGE_KEY = 'firebase_auth_migration_complete';
const EDGE_FUNCTION_URL = `${supabaseUrl}/functions/v1/migrate-firebase-password`;

/**
 * Sign in with email and password, handling Firebase password migration automatically
 *
 * This function will:
 * 1. Try to sign in with Supabase directly (if password already migrated)
 * 2. If that fails, call the Edge Function to verify Firebase password and migrate
 * 3. Return the session on success
 */
export async function signInWithPassword(email: string, password: string) {
  try {
    // First, try direct Supabase login
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (data.session) {
      console.log('✅ Signed in successfully with Supabase password');
      await AsyncStorage.setItem(MIGRATION_STORAGE_KEY, 'true');
      return { data, error: null, migrated: false };
    }

    // If login failed, try Firebase password migration
    if (error) {
      console.log('⚠️ Supabase login failed, attempting Firebase password migration...');

      const migrationResult = await migrateFirebasePassword(email, password);

      if (migrationResult.session) {
        console.log('✅ Password migrated successfully!');
        await AsyncStorage.setItem(MIGRATION_STORAGE_KEY, 'true');
        return {
          data: { session: migrationResult.session, user: migrationResult.session.user },
          error: null,
          migrated: true,
        };
      }

      return {
        data: { session: null, user: null },
        error: migrationResult.error || error,
        migrated: false,
      };
    }

    return { data, error, migrated: false };
  } catch (err) {
    console.error('❌ Error in signInWithPassword:', err);
    return {
      data: { session: null, user: null },
      error: err,
      migrated: false,
    };
  }
}

/**
 * Call the Supabase Edge Function to verify Firebase password and migrate to Supabase
 */
async function migrateFirebasePassword(email: string, password: string) {
  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({ email, password }),
    });

    const result = await response.json();

    if (response.ok && result.session) {
      // Set the session in Supabase client
      await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });

      return {
        session: result.session,
        error: null,
        migrated: result.migrated,
      };
    }

    return {
      session: null,
      error: result.error || 'Migration failed',
      migrated: false,
    };
  } catch (err) {
    console.error('❌ Error migrating Firebase password:', err);
    return {
      session: null,
      error: err.message || 'Network error',
      migrated: false,
    };
  }
}

/**
 * Sign in with OAuth provider (Google, Apple, etc.)
 */
export async function signInWithOAuth(provider: 'google' | 'apple' | 'facebook') {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: 'yourapp://auth/callback',
      },
    });

    if (data.url) {
      console.log(`✅ Opening ${provider} OAuth URL`);
      await AsyncStorage.setItem(MIGRATION_STORAGE_KEY, 'true');
    }

    return { data, error };
  } catch (err) {
    console.error(`❌ Error signing in with ${provider}:`, err);
    return { data: null, error: err };
  }
}

/**
 * Check if user needs to re-authenticate after migration
 * Call this on app startup to detect users who need to sign in again
 */
export async function checkMigrationStatus() {
  try {
    // Check if migration is already complete
    const migrationComplete = await AsyncStorage.getItem(MIGRATION_STORAGE_KEY);
    if (migrationComplete === 'true') {
      console.log('✅ Migration already complete');
      return { needsMigration: false, hasSupabaseSession: true };
    }

    // Check if user has Supabase session
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      console.log('✅ Active Supabase session found');
      await AsyncStorage.setItem(MIGRATION_STORAGE_KEY, 'true');
      return { needsMigration: false, hasSupabaseSession: true };
    }

    // No Supabase session - check if this is a first-time user or needs migration
    // You could check for Firebase session here if you still have Firebase SDK installed
    console.log('⚠️ No Supabase session found - user needs to sign in');
    return { needsMigration: true, hasSupabaseSession: false };
  } catch (err) {
    console.error('❌ Error checking migration status:', err);
    return { needsMigration: true, hasSupabaseSession: false };
  }
}

/**
 * Sign out from Supabase
 */
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    await AsyncStorage.removeItem(MIGRATION_STORAGE_KEY);
    return { error };
  } catch (err) {
    console.error('❌ Error signing out:', err);
    return { error: err };
  }
}

/**
 * Get the current session
 */
export async function getSession() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    return { session, error };
  } catch (err) {
    console.error('❌ Error getting session:', err);
    return { session: null, error: err };
  }
}

/**
 * Listen to auth state changes
 */
export function onAuthStateChange(callback: (event: string, session: any) => void) {
  return supabase.auth.onAuthStateChange(callback);
}
