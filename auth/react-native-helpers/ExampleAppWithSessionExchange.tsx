/**
 * Complete Example: Firebase to Supabase Migration with Session Exchange
 *
 * This example shows how to handle ALL migration scenarios:
 * 1. Users with valid Firebase sessions → Auto-exchange to Supabase (NO sign-out!)
 * 2. Users signing in with password → Auto-migrate password
 * 3. Users with OAuth → Re-authenticate once
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import firebase from 'firebase/app'; // Your existing Firebase import
import 'firebase/auth';

// Import both helpers
import {
  checkAndExchangeFirebaseSession,
  exchangeFirebaseSession,
  signOutBoth,
  supabase,
} from './sessionExchange';

import {
  signInWithPassword,
  signInWithOAuth,
} from './authMigration';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'checking' | 'signedIn' | 'needsSignIn'>('checking');

  useEffect(() => {
    checkInitialAuthState();

    // Listen to Supabase auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Supabase auth event:', event);

      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        setAuthMode('signedIn');
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setAuthMode('needsSignIn');
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  async function checkInitialAuthState() {
    setLoading(true);

    try {
      console.log('🔍 Checking authentication state...');

      // STEP 1: Check for Firebase session and exchange if valid
      const result = await checkAndExchangeFirebaseSession(firebase.auth());

      if (result.hasSupabaseSession) {
        console.log('✅ User has Supabase session');
        setUser(result.session?.user || null);
        setAuthMode('signedIn');

        if (result.exchanged) {
          // Show a subtle notification that migration happened
          console.log('🎉 Firebase session automatically migrated!');
          // Optionally show a toast: "Welcome back! We've upgraded your account security."
        }
      } else if (result.needsSignIn) {
        console.log('⚠️ User needs to sign in');
        setAuthMode('needsSignIn');

        // Check if they had a Firebase session before
        const hadFirebaseSession = firebase.auth().currentUser !== null;
        if (hadFirebaseSession) {
          // Firebase session exists but couldn't be exchanged
          // This might happen if the user wasn't migrated yet
          Alert.alert(
            'Welcome Back',
            'Please sign in to continue. If you previously used Google or Apple, use those options below.',
            [{ text: 'OK' }]
          );
        }
      }

    } catch (error) {
      console.error('❌ Error checking auth state:', error);
      setAuthMode('needsSignIn');
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordLogin() {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);

    try {
      // Use the password migration helper
      const { data, error, migrated } = await signInWithPassword(email, password);

      if (error) {
        if (error.hint?.includes('OAuth')) {
          Alert.alert(
            'OAuth Account Detected',
            'This account uses Google or Apple sign-in. Please use the button below.',
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert('Login Failed', error.message || 'Invalid email or password');
        }
      } else if (data.session) {
        if (migrated) {
          Alert.alert(
            'Success!',
            'Your password has been securely migrated. Welcome back!',
            [{ text: 'OK' }]
          );
        }
        setUser(data.session.user);
        setAuthMode('signedIn');
      }
    } catch (err) {
      console.error('❌ Login error:', err);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuthLogin(provider: 'google' | 'apple' | 'facebook') {
    setLoading(true);

    try {
      const { data, error } = await signInWithOAuth(provider);

      if (error) {
        Alert.alert('Login Failed', error.message || `Failed to sign in with ${provider}`);
      } else if (data?.url) {
        console.log(`✅ Opening ${provider} OAuth...`);
        // OAuth flow handled by Supabase
      }
    } catch (err) {
      console.error('❌ OAuth error:', err);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    setLoading(true);
    try {
      // Sign out from both services
      await signOutBoth(firebase.auth());
      setUser(null);
      setAuthMode('needsSignIn');
    } catch (err) {
      console.error('❌ Sign out error:', err);
      Alert.alert('Error', 'Failed to sign out');
    } finally {
      setLoading(false);
    }
  }

  // Loading state
  if (authMode === 'checking') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Checking authentication...</Text>
      </View>
    );
  }

  // Signed in state
  if (authMode === 'signedIn' && user) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Welcome Back!</Text>
        <Text style={styles.email}>{user.email}</Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            ✅ Your account has been migrated to our new secure authentication system.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, styles.signOutButton]}
          onPress={handleSignOut}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign Out</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // Sign in state
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign In</Text>

      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          🔐 We've upgraded to a more secure authentication system.
          Your existing credentials will work!
        </Text>
      </View>

      {/* Email/Password Login */}
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={handlePasswordLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* OAuth Options */}
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity
        style={[styles.button, styles.googleButton]}
        onPress={() => handleOAuthLogin('google')}
        disabled={loading}
      >
        <Text style={styles.buttonText}>Continue with Google</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.appleButton]}
        onPress={() => handleOAuthLogin('apple')}
        disabled={loading}
      >
        <Text style={styles.buttonText}>Continue with Apple</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  email: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  banner: {
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  bannerText: {
    color: '#1976D2',
    textAlign: 'center',
    fontSize: 14,
  },
  infoBox: {
    backgroundColor: '#E8F5E9',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  infoText: {
    color: '#2E7D32',
    textAlign: 'center',
    fontSize: 14,
  },
  form: {
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  button: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  googleButton: {
    backgroundColor: '#DB4437',
  },
  appleButton: {
    backgroundColor: '#000',
  },
  signOutButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ddd',
  },
  dividerText: {
    marginHorizontal: 10,
    color: '#999',
    fontSize: 14,
  },
});
