/**
 * Example Login Screen for React Native
 * Demonstrates how to use the auth migration helpers
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  signInWithPassword,
  signInWithOAuth,
  checkMigrationStatus,
  signOut,
  onAuthStateChange,
} from './authMigration';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsMigration, setNeedsMigration] = useState(false);

  useEffect(() => {
    // Check migration status on mount
    checkInitialAuthState();

    // Listen to auth state changes
    const { data: { subscription } } = onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session);

      if (event === 'SIGNED_IN') {
        console.log('✅ User signed in');
        // Navigate to your main app screen
        // navigation.navigate('Home');
      } else if (event === 'SIGNED_OUT') {
        console.log('⚠️ User signed out');
        // Navigate to login screen
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  async function checkInitialAuthState() {
    const { needsMigration, hasSupabaseSession } = await checkMigrationStatus();

    setNeedsMigration(needsMigration);

    if (hasSupabaseSession) {
      console.log('✅ User already logged in');
      // Navigate to main app
      // navigation.navigate('Home');
    } else if (needsMigration) {
      console.log('⚠️ User needs to sign in again');
      // Optionally show a banner explaining the migration
      Alert.alert(
        'Welcome Back!',
        'We\'ve upgraded our authentication system for better security. Please sign in again.',
        [{ text: 'OK' }]
      );
    }
  }

  async function handleEmailLogin() {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);

    try {
      const { data, error, migrated } = await signInWithPassword(email, password);

      if (error) {
        console.error('Login error:', error);

        // Check if it's an OAuth user
        if (error.hint?.includes('OAuth')) {
          Alert.alert(
            'OAuth Account Detected',
            error.hint,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign in with Google', onPress: () => handleOAuthLogin('google') },
              { text: 'Sign in with Apple', onPress: () => handleOAuthLogin('apple') },
            ]
          );
        } else {
          Alert.alert('Login Failed', error.message || 'Invalid email or password');
        }
      } else if (data.session) {
        if (migrated) {
          Alert.alert(
            'Success!',
            'Your password has been securely migrated. You\'re now logged in!',
            [{ text: 'OK' }]
          );
        } else {
          console.log('✅ Logged in successfully');
        }
        // Navigate to main app
        // navigation.navigate('Home');
      }
    } catch (err) {
      console.error('Unexpected error:', err);
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
        console.error(`${provider} login error:`, error);
        Alert.alert('Login Failed', error.message || `Failed to sign in with ${provider}`);
      } else if (data?.url) {
        console.log(`✅ Opening ${provider} OAuth URL:`, data.url);
        // The OAuth flow will be handled by the Supabase SDK
        // You may need to use Linking or a WebView depending on your setup
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome Back</Text>

      {needsMigration && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            We've upgraded our security! Please sign in again.
          </Text>
        </View>
      )}

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
          onPress={handleEmailLogin}
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
        <Text style={styles.dividerText}>OR</Text>
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
  banner: {
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  bannerText: {
    color: '#856404',
    textAlign: 'center',
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
  dividerText: {
    marginHorizontal: 10,
    color: '#999',
  },
});
