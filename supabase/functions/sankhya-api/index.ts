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
  if (tokenCache.accessToken && Date.now() < tokenCache.tokenExpiry - 60000) {
    return tokenCache.accessToken;
  }

  const gatewayUrl = Deno.env.get('SANKHYA_GATEWAY_URL');
  const clientId = Deno.env.get('SANKHYA_CLIENT_ID');
  const clientSecret = Deno.env.get('SANKHYA_CLIENT_SECRET');
  const xToken = Deno.env.get('SANKHYA_X_TOKEN');

  if (!gatewayUrl) throw new Error('SANKHYA_GATEWAY_URL não configurada');
  if (!clientId) throw new Error('SANKHYA_CLIENT_ID não configurado');
  if (!clientSecret) throw new Error('SANKHYA_CLIENT_SECRET não configurado');
  if (!xToken) throw new Error('SANKHYA_X_TOKEN não configurado');

  console.log('[Sankhya] Autenticando em:', `${gatewayUrl}/authenticate`);

  const response = await fetch(`${gatewayUrl}/authenticate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Token': xToken,
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

async function executeQuery(sql: string): Promise<unknown> {
  const token = await authenticate();
  const gatewayUrl = Deno.env.get('SANKHYA_GATEWAY_URL')!;

  const url = `${gatewayUrl}/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json`;
  console.log(`[Sankhya] Executando query via DbExplorerSP.executeQuery`);

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const requestBody = JSON.stringify({
    serviceName: 'DbExplorerSP.executeQuery',
    requestBody: {
      sql: sql,
    },
  });

  let response = await fetch(url, { method: 'POST', headers, body: requestBody });

  // If 401, try re-authenticating once
  if (response.status === 401) {
    console.log('[Sankhya] Token expirado, re-autenticando...');
    tokenCache.accessToken = null;
    const newToken = await authenticate();
    headers['Authorization'] = `Bearer ${newToken}`;
    response = await fetch(url, { method: 'POST', headers, body: requestBody });
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Sankhya] Erro na query:', response.status, errorText);
    throw new Error(`Erro na query Sankhya: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data;
}

async function saveCrudRecord(entityName: string, fields: Record<string, any>): Promise<unknown> {
  const token = await authenticate();
  const gatewayUrl = Deno.env.get('SANKHYA_GATEWAY_URL')!;

  const url = `${gatewayUrl}/gateway/v1/mge/service.sbr?serviceName=CRUDServiceProvider.saveRecord&outputType=json`;
  console.log(`[Sankhya] Salvando registro via CRUDServiceProvider.saveRecord - Entity: ${entityName}`);

  // Build localFields in XML-JSON format: { FIELD: { "$": "value" } }
  const localFields: Record<string, any> = {};
  const fieldList: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    localFields[key] = { "$": String(value) };
    fieldList.push(key);
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const requestBody = JSON.stringify({
    serviceName: 'CRUDServiceProvider.saveRecord',
    requestBody: {
      dataSet: {
        rootEntity: entityName,
        includePresentationFields: 'N',
        dataRow: {
          localFields,
        },
        entity: {
          fieldset: {
            list: fieldList.join(','),
          },
        },
      },
    },
  });

  console.log('[Sankhya] Payload CRUDServiceProvider.saveRecord:', requestBody);

  let response = await fetch(url, { method: 'POST', headers, body: requestBody });

  if (response.status === 401) {
    console.log('[Sankhya] Token expirado, re-autenticando...');
    tokenCache.accessToken = null;
    const newToken = await authenticate();
    headers['Authorization'] = `Bearer ${newToken}`;
    response = await fetch(url, { method: 'POST', headers, body: requestBody });
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Sankhya] Erro ao salvar:', response.status, errorText);
    throw new Error(`Erro ao salvar Sankhya: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('[Sankhya] Resposta CRUDServiceProvider:', JSON.stringify(data).substring(0, 1000));

  if (data.status === '0' || data.status === 0) {
    throw new Error(`Erro Sankhya: ${data.statusMessage || JSON.stringify(data.tsError) || 'Erro desconhecido'}`);
  }

  return data;
}

function buildCabecalhoQuery(ordemCarga: string): string {
  return `
SELECT
  ORD.ORDEMCARGA,
  ORD.ORDEMCARGA as OCBAR,
  PAR.NOMEPARC,
  PAR.CODPARC,
  CONVERT(VARCHAR(10), ORD.AD_DATAHORASADA, 103) AS AD_DATAHORASADA,
  FORMAT(ORD.VLRFRETE, 'C', 'pt-BR') AS VLRFRETE,
  CASE WHEN REG.CODREG = 11200
    THEN
      CASE
        WHEN MAX(IMP.AD_ONOFF) = 'ON' THEN 'SP-ON'
        ELSE 'SP-OFF' END
    ELSE RTRIM(REG.NOMEREG)
  END AS NOMEREG,
  CONVERT(VARCHAR(10), DTINIC, 103) AS DATAAT,
  SUM(IMP.VALOR_NOTA) AS VALOR,
  SUM(IMP.PESO_KG) AS PESO,
  SUM(IMP.M3) AS M3,
  COUNT(IMP.NUNOTA) AS QTDPEDIDO,
  PC.OPCAO AS TIPVEI,
  COUNT(DISTINCT IMP.CODIGO_DO_CLIENTE) AS QTDCLI,
  ORD.AD_KTTOT,
  ORD.AD_NROTA,
  ORD.AD_HRINIRT
FROM TGFORD ORD
JOIN IMPORDEMCARGA IMP ON IMP.ORDEMCARGA = ORD.ORDEMCARGA
JOIN TSIREG REG ON REG.CODREG = ORD.CODREG
LEFT JOIN TGFPAR PAR ON PAR.CODPARC = ORD.CODPARCMOTORISTA
LEFT JOIN TDDOPC PC ON PC.VALOR = ORD.AD_TIPVEI AND PC.NUCAMPO = 9999990461
WHERE ORD.ORDEMCARGA = ${parseInt(ordemCarga, 10)}
GROUP BY ORD.ORDEMCARGA,
  PAR.NOMEPARC,
  PAR.CODPARC,
  REG.NOMEREG,
  ORD.VLRFRETE,
  ORD.AD_DATAHORASADA,
  PC.OPCAO,
  REG.CODREG,
  DTINIC,
  ORD.AD_KTTOT,
  ORD.AD_NROTA,
  ORD.AD_HRINIRT
  `.trim();
}

function buildPedidosQuery(ordemCarga: string): string {
  return `
SELECT
  ORD.ORDEMCARGA,
  VEI.PLACA,
  UPPER(LEFT(LOWER(PAR.NOMEPARC), 1)) + LOWER(SUBSTRING(PAR.NOMEPARC, 2, LEN(PAR.NOMEPARC))) AS NOMEPARC,
  PAR.CODPARC,
  UPPER(LEFT(LOWER(VEI.MARCAMODELO), 1)) + LOWER(SUBSTRING(VEI.MARCAMODELO, 2, LEN(VEI.MARCAMODELO))) AS MARCAMODELO,
  ORD.AD_DATAHORASADA,
  ORD.VLRFRETE,
  UPPER(LEFT(LOWER(REG.NOMEREG), 1)) + LOWER(SUBSTRING(REG.NOMEREG, 2, LEN(REG.NOMEREG))) AS NOMEREG,
  GETDATE() AS DATAAT,
  IMP.RUA + ', ' + IMP.NUMERO + ' - ' + IMP.BAIRRO + ' - ' + IMP.MUNICIPIO + ' - ' + IMP.ESTADO + ' - ' + IMP.CEP AS ENDERECO,
  IMP.CODIGO_DO_CLIENTE,
  IMP.DTNEG,
  UPPER(LEFT(LOWER(IMP.NOME_DO_CLIENTE), 1)) + LOWER(SUBSTRING(IMP.NOME_DO_CLIENTE, 2, LEN(IMP.NOME_DO_CLIENTE))) AS NOME_DO_CLIENTE,
  IMP.COMPLEMENTO,
  IMP.VALOR_NOTA,
  IMP.PESO_KG,
  IMP.M3 AS M3UN,
  IMP.TEMPO_DE_ATENDIMENTO_NO_CLIENTE_MIN,
  IMP.INICIO_DO_INTERVALO_PERMITIDO,
  IMP.FIM_DO_INTERVALO_PERMITIDO,
  IMP.INICIO_DO_INTERVALO_PERMITIDO2,
  IMP.FIM_DO_INTERVALO_PERMITIDO2,
  IMP.TELEFONE,
  IMP.NUNOTA,
  NF.STATUS AS STATUS_ACERTO,
  VEN.APELIDO AS VENDEDOR,
  IMP.NUMNOTA,
  IMP.DESCRTIPPARC,
  CASE WHEN CAB.AD_CARTASELO = 'SIM' THEN 'CARTA SELO' ELSE '' END AS CARTASELO,
  CASE WHEN IMP.AGENDAMENTO = 'S' THEN 'AGENDAMENTO' ELSE '' END AS AGENDAMENTO,
  CASE WHEN CAB.AD_PRIOR = 'S' THEN 'PRIORIDADE'
    WHEN EXISTS (
      SELECT 1
      FROM AD_DIAATE DIA
      WHERE DIA.CODCID = PAR2.CODCID ) THEN 'PRIORIDADE'
    ELSE '' END AS PRIORIDADE,
  CAB.SEQCARGA,
  CASE WHEN EXISTS (
    SELECT 1
    FROM AD_NFACERTO AC
    WHERE AC.NUNOTA = IMP.NUNOTA
    AND AC.STATUS = 3) THEN 'REENTREGA'
    ELSE '' END AS REENT
FROM TGFORD ORD
JOIN IMPORDEMCARGA IMP ON IMP.ORDEMCARGA = ORD.ORDEMCARGA
JOIN TGFCAB CAB ON CAB.NUNOTA = IMP.NUNOTA
JOIN TSIREG REG ON REG.CODREG = ORD.CODREG
LEFT JOIN AD_NFACERTO NF ON NF.ORDEMCARGA = ORD.ORDEMCARGA AND NF.NUNOTA = IMP.NUNOTA
LEFT JOIN TGFPAR PAR ON PAR.CODPARC = ORD.CODPARCMOTORISTA
LEFT JOIN TGFVEI VEI ON VEI.CODPARC = ORD.CODPARCMOTORISTA
LEFT JOIN TGFVEN VEN ON VEN.CODVEND = CAB.CODVEND
LEFT JOIN TGFPAR PAR2 ON PAR2.CODPARC = IMP.CODIGO_DO_CLIENTE
WHERE ORD.ORDEMCARGA = ${parseInt(ordemCarga, 10)}
ORDER BY CAB.SEQCARGA
  `.trim();
}

// Parse Sankhya DbExplorer response into array of objects
function parseDbExplorerResponse(data: any): Record<string, any>[] {
  try {
    const responseBody = data?.responseBody || data?.requestBody;
    if (!responseBody) {
      console.log('[Sankhya] Response structure:', JSON.stringify(data).substring(0, 500));
      // Try to parse rows directly if the response has a different structure
      if (data?.rows || data?.registros) {
        return data.rows || data.registros;
      }
      return [];
    }

    const rows = responseBody?.rows || [];
    const fieldsMetadata = responseBody?.fieldsMetadata || [];

    if (!Array.isArray(rows)) return [];

    // Map rows to objects using field metadata
    return rows.map((row: any[]) => {
      const obj: Record<string, any> = {};
      fieldsMetadata.forEach((field: any, index: number) => {
        const fieldName = field?.name || field?.label || `field_${index}`;
        obj[fieldName] = row[index] ?? null;
      });
      return obj;
    });
  } catch (e) {
    console.error('[Sankhya] Erro ao parsear resposta:', e);
    console.log('[Sankhya] Raw data:', JSON.stringify(data).substring(0, 1000));
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, method, path, ordemCarga } = body;

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

    // Action: getCabecalho - get ordem de carga header data
    if (action === 'getCabecalho') {
      if (!ordemCarga) {
        return new Response(
          JSON.stringify({ success: false, error: 'ordemCarga é obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const sql = buildCabecalhoQuery(ordemCarga);
      console.log('[Sankhya] Query cabeçalho para OC:', ordemCarga);
      const rawData = await executeQuery(sql);
      const records = parseDbExplorerResponse(rawData);

      return new Response(
        JSON.stringify({
          success: records.length > 0,
          data: records.length > 0 ? records[0] : null,
          rawResponse: rawData,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: getPedidos - get pedidos for ordem de carga
    if (action === 'getPedidos') {
      if (!ordemCarga) {
        return new Response(
          JSON.stringify({ success: false, error: 'ordemCarga é obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const sql = buildPedidosQuery(ordemCarga);
      console.log('[Sankhya] Query pedidos para OC:', ordemCarga);
      const rawData = await executeQuery(sql);
      const records = parseDbExplorerResponse(rawData);

      return new Response(
        JSON.stringify({
          success: records.length > 0,
          data: records,
          total: records.length,
          rawResponse: rawData,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: request - proxy any Sankhya API call (legacy)
    if (action === 'request') {
      if (!path) {
        return new Response(
          JSON.stringify({ success: false, error: 'Path é obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const token = await authenticate();
      const gatewayUrl = Deno.env.get('SANKHYA_GATEWAY_URL')!;
      const url = `${gatewayUrl}${path}`;
      console.log(`[Sankhya] ${method || 'GET'} ${url}`);

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const fetchOptions: RequestInit = { method: method || 'GET', headers };
      if (body && (method === 'POST' || method === 'PUT')) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);
      const data = await response.json();

      return new Response(
        JSON.stringify({ success: response.ok, status: response.status, data }),
        {
          status: response.ok ? 200 : response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Action: saveAcerto - insert/update AD_NFACERTO status for each pedido
    if (action === 'saveAcerto') {
      const pedidos = body.pedidos;
      // pedidos expected: [{ nunota: number, ordemCarga: number, status: number }]
      if (!Array.isArray(pedidos) || pedidos.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'pedidos é obrigatório (array com nunota, ordemCarga, status)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const results: { nunota: number; success: boolean; action: string; error?: string; response?: unknown }[] = [];

      for (const p of pedidos) {
        const nunota = parseInt(String(p.nunota), 10);
        const ordemCarga = parseInt(String(p.ordemCarga), 10);
        const status = parseInt(String(p.status), 10);

        try {
          // Check if record exists in AD_NFACERTO
          const checkSql = `SELECT NUNOTA, ORDEMCARGA, STATUS FROM AD_NFACERTO WHERE NUNOTA = ${nunota} AND ORDEMCARGA = ${ordemCarga}`;
          const checkResult = await executeQuery(checkSql);
          const existing = parseDbExplorerResponse(checkResult);

          if (existing.length === 0) {
            // INSERT via CRUDServiceProvider.saveRecord
            console.log(`[Sankhya] INSERT AD_NFACERTO: NUNOTA=${nunota}, OC=${ordemCarga}, STATUS=${status}`);
            const saveResult = await saveCrudRecord('AD_NFACERTO', {
              NUNOTA: nunota,
              ORDEMCARGA: ordemCarga,
              STATUS: status,
            });
            results.push({ nunota, success: true, action: 'inserted', response: saveResult });
          } else {
            // UPDATE via CRUDServiceProvider.saveRecord (same call, PK fields identify the record)
            console.log(`[Sankhya] UPDATE AD_NFACERTO: NUNOTA=${nunota}, OC=${ordemCarga}, STATUS=${status}`);
            const saveResult = await saveCrudRecord('AD_NFACERTO', {
              NUNOTA: nunota,
              ORDEMCARGA: ordemCarga,
              STATUS: status,
            });
            results.push({ nunota, success: true, action: 'updated', response: saveResult });
          }
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : 'Erro desconhecido';
          console.error(`[Sankhya] Erro ao salvar AD_NFACERTO para NUNOTA ${nunota}:`, errMsg);
          results.push({ nunota, success: false, action: 'error', error: errMsg });
        }
      }

      return new Response(
        JSON.stringify({ success: results.every(r => r.success), results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: getMotivosDevol - get motivos de devolução
    if (action === 'getMotivosDevol') {
      const sql = `SELECT CODIGO, DESCRICAO FROM AD_MOTDEV ORDER BY DESCRICAO`;
      const rawData = await executeQuery(sql);
      const records = parseDbExplorerResponse(rawData);

      return new Response(
        JSON.stringify({ success: true, data: records }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: uploadCanhoto - save record to AD_CANHOTOS and upload image via sessionUpload.mge
    if (action === 'uploadCanhoto') {
      const { nunota, numnota, storagePath, imageBase64, imageMimeType } = body;
      if (!nunota || !numnota) {
        return new Response(
          JSON.stringify({ success: false, error: 'nunota e numnota são obrigatórios' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const nunotaInt = parseInt(String(nunota), 10);
      const numnotaInt = parseInt(String(numnota), 10);

      // Step 1: Create record in AD_CANHOTOS via CRUDServiceProvider.saveRecord
      console.log(`[Sankhya] Criando registro AD_CANHOTOS: NUNOTA=${nunotaInt}, NUMNOTA=${numnotaInt}`);
      try {
        await saveCrudRecord('AD_CANHOTOS', {
          NUNOTA: nunotaInt,
          NUMNOTA: numnotaInt,
        });
      } catch (e) {
        console.warn('[Sankhya] Aviso ao criar registro AD_CANHOTOS (pode já existir):', e instanceof Error ? e.message : e);
      }

      // Step 2: Get image bytes - from storage or base64
      let imageBytes: Uint8Array;
      let mimeType = imageMimeType || 'image/jpeg';

      if (storagePath) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const downloadUrl = `${supabaseUrl}/storage/v1/object/canhotos/${storagePath}`;
        console.log(`[Sankhya] Baixando imagem do bucket: ${storagePath}`);

        const dlResponse = await fetch(downloadUrl, {
          headers: { 'Authorization': `Bearer ${serviceKey}` },
        });

        if (!dlResponse.ok) {
          const errText = await dlResponse.text();
          console.error('[Sankhya] Erro ao baixar do bucket:', dlResponse.status, errText);
          return new Response(
            JSON.stringify({ success: false, error: `Erro ao baixar imagem do bucket: ${dlResponse.status}` }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const contentType = dlResponse.headers.get('content-type');
        if (contentType) mimeType = contentType;
        imageBytes = new Uint8Array(await dlResponse.arrayBuffer());
        console.log(`[Sankhya] Imagem baixada: ${imageBytes.length} bytes, tipo: ${mimeType}`);
      } else if (imageBase64) {
        const binaryStr = atob(imageBase64);
        imageBytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          imageBytes[i] = binaryStr.charCodeAt(i);
        }
      } else {
        return new Response(
          JSON.stringify({ success: false, error: 'storagePath ou imageBase64 é obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Step 3: Upload image via sessionUpload.mge
      const token = await authenticate();
      const gatewayUrl = Deno.env.get('SANKHYA_GATEWAY_URL')!;
      const xToken = Deno.env.get('SANKHYA_X_TOKEN')!;

      const sessionKey = 'CANHOTO_00N';
      const uploadUrl = `${gatewayUrl}/gateway/v1/mge/sessionUpload.mge?sessionkey=${encodeURIComponent(sessionKey)}&fitem=S&salvar=S&useCache=N`;

      console.log(`[Sankhya] Upload canhoto: sessionKey=${sessionKey}, size=${imageBytes.length} bytes`);

      const ext = mimeType.includes('png') ? 'png' : 'jpg';
      const blob = new Blob([imageBytes], { type: mimeType });
      const formData = new FormData();
      formData.append('arquivo', blob, `canhoto_${nunotaInt}.${ext}`);

      const uploadHeaders: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'text/html',
      };

      let uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: uploadHeaders,
        body: formData,
      });

      if (uploadResponse.status === 401) {
        tokenCache.accessToken = null;
        const newToken = await authenticate();
        uploadHeaders['Authorization'] = `Bearer ${newToken}`;
        uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          headers: uploadHeaders,
          body: formData,
        });
      }

      const uploadResultText = await uploadResponse.text();
      console.log(`[Sankhya] Upload response status: ${uploadResponse.status}`);
      console.log('[Sankhya] Upload response body:', uploadResultText.substring(0, 1000));

      return new Response(
        JSON.stringify({ success: uploadResponse.ok, message: 'Upload canhoto', nunota: nunotaInt, status: uploadResponse.status, response: uploadResultText.substring(0, 500) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Action inválida. Use "test", "getCabecalho", "getPedidos", "saveAcerto", "getMotivosDevol" ou "request".' }),
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
