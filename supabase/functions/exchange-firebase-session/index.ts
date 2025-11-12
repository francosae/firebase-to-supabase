import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Exchange Firebase Session for Supabase Session
 *
 * This function validates a Firebase ID token and issues a Supabase session for the same user.
 * This allows users to stay signed in without needing to re-authenticate.
 *
 * Flow:
 * 1. Receive Firebase ID token from client
 * 2. Validate token using Firebase Admin SDK (via external service)
 * 3. Find matching user in Supabase by email/Firebase UID
 * 4. Generate Supabase session for that user
 * 5. Return Supabase session to client
 */

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the Firebase ID token from request
    const { firebaseToken } = await req.json()

    if (!firebaseToken) {
      return new Response(
        JSON.stringify({ error: 'Firebase token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Validating Firebase token...')

    // Validate Firebase token using the Firebase Admin SDK service
    const FIREBASE_TOKEN_VERIFY_URL = "https://olive-token-check-hidden-feather-638.fly.dev/"

    if (!FIREBASE_TOKEN_VERIFY_URL) {
      console.error('FIREBASE_TOKEN_VERIFY_URL not configured')
      return new Response(
        JSON.stringify({ error: 'Firebase token verification service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify the Firebase token
    const verifyResponse = await fetch(FIREBASE_TOKEN_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: firebaseToken }),
    })

    if (!verifyResponse.ok) {
      const errorText = await verifyResponse.text()
      console.error('Firebase token verification failed:', errorText)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired Firebase token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const firebaseUser = await verifyResponse.json()
    console.log('Firebase token valid for user:', firebaseUser.uid)
    console.log('Firebase user email:', firebaseUser.email)
    console.log('Full Firebase user data:', JSON.stringify(firebaseUser))

    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Find the user in Supabase by Firebase UID stored in metadata
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()

    if (listError) {
      console.error('Error listing users:', listError)
      return new Response(
        JSON.stringify({ error: 'Failed to find user', details: listError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${users.length} users in Supabase`)
    console.log('Looking for Firebase UID:', firebaseUser.uid)
    console.log('Looking for email:', firebaseUser.email)

    // Debug: Check first few users
    users.slice(0, 3).forEach((u, i) => {
      console.log(`User ${i + 1}:`, {
        id: u.id,
        email: u.email,
        full_user_metadata: JSON.stringify(u.user_metadata),
        metadata_fbuser_uid: u.user_metadata?.fbuser?.uid,
        has_fbuser: !!u.user_metadata?.fbuser
      })
    })

    // Find user by Firebase UID or email
    const user = users.find(u => {
      const matchesUid = u.user_metadata?.fbuser?.uid === firebaseUser.uid
      const matchesEmail = firebaseUser.email && u.email?.toLowerCase() === firebaseUser.email.toLowerCase()

      if (u.email?.toLowerCase() === firebaseUser.email?.toLowerCase()) {
        console.log('Email match found, checking UID:', {
          user_id: u.id,
          user_email: u.email,
          metadata_uid: u.user_metadata?.fbuser?.uid,
          firebase_uid: firebaseUser.uid,
          uid_match: matchesUid,
          uid_types: {
            metadata_uid_type: typeof u.user_metadata?.fbuser?.uid,
            firebase_uid_type: typeof firebaseUser.uid
          }
        })
      }

      return matchesUid || matchesEmail
    })

    if (!user) {
      console.log('❌ User not found in Supabase')
      console.log('Searched for:', {
        firebase_uid: firebaseUser.uid,
        firebase_email: firebaseUser.email
      })

      // Find users with matching email to debug
      const emailMatches = users.filter(u =>
        u.email?.toLowerCase() === firebaseUser.email?.toLowerCase()
      )
      console.log('Users with matching email:', emailMatches.length)
      if (emailMatches.length > 0) {
        emailMatches.forEach(u => {
          console.log('  - Email match but UID mismatch:', {
            email: u.email,
            supabase_fbuser_uid: u.user_metadata?.fbuser?.uid,
            firebase_uid: firebaseUser.uid,
            match: u.user_metadata?.fbuser?.uid === firebaseUser.uid
          })
        })
      }

      return new Response(
        JSON.stringify({
          error: 'User not found',
          hint: 'This user may not have been migrated to Supabase yet',
          debug: {
            searched_for: {
              uid: firebaseUser.uid,
              email: firebaseUser.email
            },
            total_users: users.length
          }
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Found Supabase user:', user.id)

    // Generate a Supabase session for this user
    // We'll create a short-lived token that the client can use to establish a session
    const { data: tokenData, error: tokenError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email!,
      options: {
        redirectTo: 'noredirect', // We'll handle the session client-side
      }
    })

    if (tokenError || !tokenData) {
      console.error('Error generating auth link:', tokenError)

      // Fallback: Use the session creation method if available
      // Note: This is a workaround - ideally we'd use admin.createSession when available
      try {
        // Alternative approach: Update user metadata to mark session exchange
        const { data: updateData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          user.id,
          {
            user_metadata: {
              ...user.user_metadata,
              last_firebase_session_exchange: new Date().toISOString()
            }
          }
        )

        if (updateError) {
          console.error('Error updating user metadata:', updateError)
        }

        // Return user info so client can use it to get a session
        return new Response(
          JSON.stringify({
            user: {
              id: user.id,
              email: user.email,
            },
            exchanged: true,
            message: 'Firebase session validated. Please sign in with Supabase to complete exchange.',
            hint: 'Use the migrated password or OAuth'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } catch (fallbackError) {
        console.error('Fallback failed:', fallbackError)
        return new Response(
          JSON.stringify({ error: 'Failed to exchange session', details: tokenError?.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Extract the token from the magic link
    const urlParams = new URL(tokenData.properties.action_link).searchParams
    const accessToken = urlParams.get('access_token')
    const refreshToken = urlParams.get('refresh_token')

    if (!accessToken || !refreshToken) {
      console.error('Failed to extract tokens from magic link')
      return new Response(
        JSON.stringify({ error: 'Failed to generate session tokens' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ Session exchange successful!')

    // Mark that session was exchanged (for tracking)
    try {
      await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        {
          user_metadata: {
            ...user.user_metadata,
            last_firebase_session_exchange: new Date().toISOString()
          }
        }
      )
      console.log('📊 Tracked session exchange for user:', user.id)
    } catch (trackError) {
      console.warn('Failed to track session exchange (non-critical):', trackError)
    }

    // Return the Supabase session
    return new Response(
      JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: user.id,
          email: user.email,
        },
        exchanged: true,
        message: 'Firebase session successfully exchanged for Supabase session'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
