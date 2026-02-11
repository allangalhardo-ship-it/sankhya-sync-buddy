const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface TokenCache {
  accessToken: string | null;
  tokenExpiry: number;
}

const tokenCache: TokenCache = {
  accessToken: null,
  tokenExpiry: 0,
};

async function authenticate(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (tokenCache.accessToken && Date.now() < tokenCache.tokenExpiry - 60000) {
    return tokenCache.accessToken;
  }

  const gatewayUrl = Deno.env.get('SANKHYA_GATEWAY_URL');
  const clientId = Deno.env.get('SANKHYA_CLIENT_ID');
  const clientSecret = Deno.env.get('SANKHYA_CLIENT_SECRET');

  if (!gatewayUrl) throw new Error('SANKHYA_GATEWAY_URL não configurada');
  if (!clientId) throw new Error('SANKHYA_CLIENT_ID não configurado');
  if (!clientSecret) throw new Error('SANKHYA_CLIENT_SECRET não configurado');

  console.log('[Sankhya] Autenticando...');

  const response = await fetch(`${gatewayUrl}/gateway/v1/mge/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Sankhya] Erro na autenticação:', response.status, errorText);
    throw new Error(`Erro na autenticação Sankhya: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  tokenCache.accessToken = data.access_token;
  tokenCache.tokenExpiry = Date.now() + (data.expires_in * 1000);

  console.log('[Sankhya] Autenticação bem-sucedida! Token expira em', data.expires_in, 's');
  return data.access_token;
}

async function sankhyaRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  const token = await authenticate();
  const gatewayUrl = Deno.env.get('SANKHYA_GATEWAY_URL')!;

  const url = `${gatewayUrl}${path}`;
  console.log(`[Sankhya] ${method} ${url}`);

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const fetchOptions: RequestInit = { method, headers };
  if (body && (method === 'POST' || method === 'PUT')) {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);

  // If 401, try re-authenticating once
  if (response.status === 401) {
    console.log('[Sankhya] Token expirado, re-autenticando...');
    tokenCache.accessToken = null;
    const newToken = await authenticate();
    headers['Authorization'] = `Bearer ${newToken}`;
    return fetch(url, { method, headers, body: fetchOptions.body as string });
  }

  return response;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, method, path, body } = await req.json();

    // Action: test - just test authentication
    if (action === 'test') {
      const token = await authenticate();
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Conexão com Sankhya estabelecida com sucesso!',
          tokenPreview: token.substring(0, 20) + '...',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: request - proxy any Sankhya API call
    if (action === 'request') {
      if (!path) {
        return new Response(
          JSON.stringify({ success: false, error: 'Path é obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const response = await sankhyaRequest(method || 'GET', path, body);
      const data = await response.json();

      return new Response(
        JSON.stringify({
          success: response.ok,
          status: response.status,
          data,
        }),
        {
          status: response.ok ? 200 : response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Action inválida. Use "test" ou "request".' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Sankhya] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
