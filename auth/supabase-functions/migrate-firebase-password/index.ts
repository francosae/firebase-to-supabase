import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the request body
    const { email, password } = await req.json()

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    // Step 1: Try normal Supabase login first (in case password was already migrated)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    })

    // If login successful, return the session
    if (loginData.session) {
      return new Response(
        JSON.stringify({
          session: loginData.session,
          migrated: false,
          message: 'Login successful'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 2: Login failed - check if this is a Firebase user that needs migration
    console.log('Login failed, checking for Firebase password migration...')

    // Get user by email to check if they have Firebase password hash
    const { data: { users }, error: userError } = await supabaseAdmin.auth.admin.listUsers()

    if (userError) {
      console.error('Error listing users:', userError)
      return new Response(
        JSON.stringify({ error: 'Authentication failed', details: userError.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user has Firebase password data
    const fbUser = user.user_metadata?.fbuser
    const passwordHash = fbUser?.passwordHash
    const passwordSalt = fbUser?.passwordSalt

    if (!passwordHash || !passwordSalt) {
      // User doesn't have Firebase password (probably OAuth user)
      return new Response(
        JSON.stringify({
          error: 'Invalid credentials',
          hint: 'This account may use OAuth (Google/Apple). Try signing in with your social account.'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 3: Verify password against Firebase hash using the middleware
    const FIREBASE_PW_VERIFY_URL = Deno.env.get('FIREBASE_PW_VERIFY_URL')

    if (!FIREBASE_PW_VERIFY_URL) {
      console.error('FIREBASE_PW_VERIFY_URL not configured')
      return new Response(
        JSON.stringify({ error: 'Password verification service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Verifying Firebase password...')

    const verifyResponse = await fetch(FIREBASE_PW_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        salt: passwordSalt,
        hash: passwordHash,
        password: password,
      }),
    })

    const verifyResult = await verifyResponse.text()

    if (verifyResult !== 'valid') {
      return new Response(
        JSON.stringify({ error: 'Invalid credentials' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Firebase password verified! Migrating to Supabase...')

    // Step 4: Password is valid! Update user's password in Supabase
    const { data: updateData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password: password }
    )

    if (updateError) {
      console.error('Error updating password:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to migrate password', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Password migrated successfully!')

    // Step 5: Sign in the user with their new Supabase password
    const { data: newLoginData, error: newLoginError } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    })

    if (newLoginError || !newLoginData.session) {
      console.error('Error signing in after migration:', newLoginError)
      return new Response(
        JSON.stringify({ error: 'Password migrated but login failed', details: newLoginError?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Success! Return the session
    return new Response(
      JSON.stringify({
        session: newLoginData.session,
        migrated: true,
        message: 'Password successfully migrated and logged in'
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
