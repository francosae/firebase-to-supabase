/**
 * Firebase to Supabase Session Exchange Helpers for React Native
 *
 * This file handles seamless session migration from Firebase to Supabase.
 * Users with valid Firebase sessions will automatically get Supabase sessions
 * without needing to sign out or re-authenticate.
 */

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Initialize your Supabase client
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const SESSION_EXCHANGE_KEY = 'firebase_session_exchanged';
const EDGE_FUNCTION_URL = `${supabaseUrl}/functions/v1/exchange-firebase-session`;

interface FirebaseAuth {
  currentUser: any | null;
  onAuthStateChanged: (callback: (user: any) => void) => () => void;
}

/**
 * Exchange a Firebase session for a Supabase session
 *
 * This function takes a Firebase ID token and exchanges it for a Supabase session.
 * The user stays logged in without needing to re-authenticate.
 *
 * @param firebaseToken - The Firebase ID token from Firebase.auth().currentUser.getIdToken()
 * @returns Promise with session data or error
 */
export async function exchangeFirebaseSession(firebaseToken: string) {
  try {
    console.log('🔄 Exchanging Firebase session for Supabase session...');

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({ firebaseToken }),
    });

    const result = await response.json();

    if (response.ok && result.access_token) {
      // Set the session in Supabase client
      const { data, error } = await supabase.auth.setSession({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      });

      if (error) {
        console.error('❌ Failed to set Supabase session:', error);
        return { success: false, error };
      }

      console.log('✅ Session exchanged successfully!');

      // Mark that exchange is complete
      await AsyncStorage.setItem(SESSION_EXCHANGE_KEY, 'true');

      return {
        success: true,
        session: data.session,
        user: data.user,
      };
    }

    // If exchange didn't work, return error
    console.warn('⚠️ Session exchange failed:', result.error);
    return {
      success: false,
      error: result.error || 'Failed to exchange session',
      hint: result.hint,
    };

  } catch (err) {
    console.error('❌ Error exchanging session:', err);
    return {
      success: false,
      error: err.message || 'Network error',
    };
  }
}

/**
 * Check and migrate Firebase session to Supabase on app startup
 *
 * This is the main function to call when your app starts.
 * It checks for existing sessions and handles migration automatically.
 *
 * @param firebaseAuth - Your Firebase auth instance (optional, for automatic detection)
 * @returns Promise with migration status
 */
export async function checkAndExchangeFirebaseSession(firebaseAuth?: FirebaseAuth) {
  try {
    // Check if exchange already happened
    const exchanged = await AsyncStorage.getItem(SESSION_EXCHANGE_KEY);
    if (exchanged === 'true') {
      console.log('✅ Session already exchanged, checking Supabase session...');

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        return {
          needsExchange: false,
          hasSupabaseSession: true,
          session,
        };
      }

      // Session expired, clear exchange flag
      await AsyncStorage.removeItem(SESSION_EXCHANGE_KEY);
    }

    // Check if we have a Supabase session
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      console.log('✅ Active Supabase session found');
      await AsyncStorage.setItem(SESSION_EXCHANGE_KEY, 'true');
      return {
        needsExchange: false,
        hasSupabaseSession: true,
        session,
      };
    }

    // No Supabase session - check for Firebase session
    if (firebaseAuth?.currentUser) {
      console.log('🔍 Found Firebase user, attempting session exchange...');

      try {
        // Get Firebase ID token
        const firebaseToken = await firebaseAuth.currentUser.getIdToken(false);

        // Exchange for Supabase session
        const result = await exchangeFirebaseSession(firebaseToken);

        if (result.success) {
          return {
            needsExchange: false,
            hasSupabaseSession: true,
            session: result.session,
            exchanged: true,
          };
        }

        console.warn('⚠️ Session exchange failed, user needs to sign in');
      } catch (err) {
        console.error('❌ Error getting Firebase token:', err);
      }
    }

    // No sessions found - user needs to sign in
    console.log('⚠️ No active session found, user needs to sign in');
    return {
      needsExchange: false,
      hasSupabaseSession: false,
      needsSignIn: true,
    };

  } catch (err) {
    console.error('❌ Error checking sessions:', err);
    return {
      needsExchange: false,
      hasSupabaseSession: false,
      error: err.message,
    };
  }
}

/**
 * Manual session exchange (if you're not using automatic detection)
 *
 * Call this when you have a Firebase token and want to exchange it manually.
 */
export async function manualSessionExchange(firebaseToken: string) {
  return await exchangeFirebaseSession(firebaseToken);
}

/**
 * Clear session exchange status (useful for testing or logout)
 */
export async function clearSessionExchangeStatus() {
  await AsyncStorage.removeItem(SESSION_EXCHANGE_KEY);
  console.log('🧹 Session exchange status cleared');
}

/**
 * Sign out from both Firebase and Supabase
 */
export async function signOutBoth(firebaseAuth?: FirebaseAuth) {
  try {
    // Sign out from Supabase
    await supabase.auth.signOut();

    // Sign out from Firebase if still connected
    if (firebaseAuth) {
      await firebaseAuth.currentUser?.signOut?.();
    }

    // Clear exchange status
    await clearSessionExchangeStatus();

    console.log('✅ Signed out from both services');
  } catch (err) {
    console.error('❌ Error signing out:', err);
  }
}
