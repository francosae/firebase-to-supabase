import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
async function findUserByEmail(supabase, email) {
  let page = 1;
  const perPage = 1000;
  while(page <= 10){
    const { data: { users }, error } = await supabase.auth.admin.listUsers({
      page,
      perPage
    });
    if (error) throw error;
    const user = users.find((u)=>u.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (users.length < perPage) break;
    page++;
  }
  return null;
}
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { firebaseToken } = await req.json();
    if (!firebaseToken) {
      return new Response(JSON.stringify({
        error: 'Firebase token required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Verify Firebase token
    const verifyResp = await fetch("https://olive-token-check-hidden-feather-638.fly.dev/", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: firebaseToken
      })
    });
    if (!verifyResp.ok) {
      return new Response(JSON.stringify({
        error: 'Invalid Firebase token'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const fbUser = await verifyResp.json();
    if (!fbUser.email) {
      return new Response(JSON.stringify({
        error: 'No email in token'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    // Find user
    const user = await findUserByEmail(supabaseAdmin, fbUser.email);
    if (!user) {
      return new Response(JSON.stringify({
        error: 'User not found',
        email: fbUser.email
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log('Found user:', user.id);
    // Generate OTP for the user
    const { data: otpData, error: otpError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email
    });
    if (otpError || !otpData) {
      console.error('OTP generation failed:', otpError);
      return new Response(JSON.stringify({
        error: 'Failed to generate session',
        details: otpError?.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Extract token from the magic link
    const actionLink = otpData.properties.action_link;
    console.log('Full action link:', actionLink);
    const url = new URL(actionLink);
    const tokenHash = url.searchParams.get('token_hash');
    const token = url.searchParams.get('token');
    const type = url.searchParams.get('type');
    console.log('URL params:', {
      token_hash: tokenHash,
      token: token,
      type: type
    });
    // Try token_hash first, fallback to token
    const authToken = tokenHash || token;
    if (!authToken) {
      console.error('No token found in magic link');
      console.error('All params:', Array.from(url.searchParams.entries()));
      return new Response(JSON.stringify({
        error: 'Failed to extract token from magic link',
        debug: {
          has_token_hash: !!tokenHash,
          has_token: !!token,
          all_params: Array.from(url.searchParams.entries())
        }
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log('Got token, verifying OTP...');
    // Use the token to verify and get a session
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '');
    // Use token_hash if available, otherwise use token
    const verifyParams = {
      type: type || 'magiclink'
    };
    if (tokenHash) {
      verifyParams.token_hash = tokenHash;
    } else {
      verifyParams.token_hash = token;
    }
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.verifyOtp(verifyParams);
    if (sessionError || !sessionData.session) {
      console.error('Session creation failed:', sessionError);
      return new Response(JSON.stringify({
        error: 'Failed to create session',
        details: sessionError?.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log('✅ Session created successfully');
    return new Response(JSON.stringify({
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_in: sessionData.session.expires_in,
      expires_at: sessionData.session.expires_at,
      user: {
        id: sessionData.user.id,
        email: sessionData.user.email
      }
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({
      error: 'Internal error',
      details: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
