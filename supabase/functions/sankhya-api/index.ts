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

// Convert Sankhya date format "ddMMyyyy HH:mm:ss" to "dd/MM/yyyy"
function formatDtnegForCrud(dtneg: string): string {
  if (!dtneg) return dtneg;
  // Already in dd/MM/yyyy format
  if (dtneg.includes('/')) return dtneg.split(' ')[0];
  // Format: "ddMMyyyy HH:mm:ss" or "ddMMyyyy"
  const cleaned = dtneg.trim().split(' ')[0];
  if (cleaned.length === 8) {
    return `${cleaned.substring(0, 2)}/${cleaned.substring(2, 4)}/${cleaned.substring(4, 8)}`;
  }
  return dtneg;
}

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
        includePresentationFields: 'S',
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

async function updateCrudRecord(entityName: string, pkFields: Record<string, any>, updateFields: Record<string, any>): Promise<unknown> {
  const token = await authenticate();
  const gatewayUrl = Deno.env.get('SANKHYA_GATEWAY_URL')!;
  const url = `${gatewayUrl}/gateway/v1/mge/service.sbr?serviceName=CRUDServiceProvider.saveRecord&outputType=json`;

  const localFields: Record<string, any> = {};
  const allFields = { ...pkFields, ...updateFields };
  const fieldList: string[] = [];
  for (const [k, v] of Object.entries(allFields)) {
    localFields[k] = { "$": String(v) };
    fieldList.push(k);
  }
  const key: Record<string, any> = {};
  for (const [k, v] of Object.entries(pkFields)) {
    key[k] = { "$": String(v) };
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
        includePresentationFields: 'S',
        dataRow: { localFields, key },
        entity: { fieldset: { list: fieldList.join(',') } },
      },
    },
  });

  console.log('[Sankhya] UPDATE payload:', requestBody.substring(0, 1000));
  let response = await fetch(url, { method: 'POST', headers, body: requestBody });
  if (response.status === 401) {
    tokenCache.accessToken = null;
    const newToken = await authenticate();
    headers['Authorization'] = `Bearer ${newToken}`;
    response = await fetch(url, { method: 'POST', headers, body: requestBody });
  }
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erro ao atualizar Sankhya: ${response.status} - ${errorText}`);
  }
  const data = await response.json();
  console.log('[Sankhya] UPDATE response:', JSON.stringify(data).substring(0, 1000));
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
  CAB.CODVEND,
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
            // UPDATE via updateCrudRecord with PK fields
            console.log(`[Sankhya] UPDATE AD_NFACERTO: NUNOTA=${nunota}, OC=${ordemCarga}, STATUS=${status}`);
            const saveResult = await updateCrudRecord(
              'AD_NFACERTO',
              { NUNOTA: nunota, ORDEMCARGA: ordemCarga },
              { STATUS: status }
            );
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
        const crudFields: Record<string, any> = { NUNOTA: nunotaInt, NUMNOTA: numnotaInt };
        if (body.codparc) crudFields.CODPARC = parseInt(String(body.codparc), 10);
        if (body.vlrnota !== undefined && body.vlrnota !== null) crudFields.VLRNOTA = parseFloat(String(body.vlrnota));
        if (body.dtneg) crudFields.DTNEG = formatDtnegForCrud(body.dtneg);
        if (body.codvend) crudFields.CODVEND = parseInt(String(body.codvend), 10);
        await saveCrudRecord('AD_CANHOTOS', crudFields);
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

      // Step 3: Upload file via sessionUpload.mge + link to CANHOTO2 (image field) via $file.session.key
      const token = await authenticate();
      const gatewayUrl = Deno.env.get('SANKHYA_GATEWAY_URL')!;

      const ext = mimeType.includes('png') ? 'png' : 'jpg';
      const internalName = `canhoto_${nunotaInt}.${ext}`;

      // Build multipart body manually
      const boundary = `----FormBoundary${Date.now()}${Math.random().toString(36).substring(2)}`;
      const headerPart = `--${boundary}\r\nContent-Disposition: form-data; name="arquivo"; filename="${internalName}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
      const footerPart = `\r\n--${boundary}--\r\n`;

      const headerBytes = new TextEncoder().encode(headerPart);
      const footerBytes = new TextEncoder().encode(footerPart);
      const multipartBody = new Uint8Array(headerBytes.length + imageBytes.length + footerBytes.length);
      multipartBody.set(headerBytes, 0);
      multipartBody.set(imageBytes, headerBytes.length);
      multipartBody.set(footerBytes, headerBytes.length + imageBytes.length);

      // Step 3a: Upload file to session
      // For image fields, sessionkey = {Table}_{Field}
      const sessionKey = `AD_CANHOTOS_CANHOTO2`;
      const sessionUploadUrl = `${gatewayUrl}/gateway/v1/mge/sessionUpload.mge?sessionkey=${encodeURIComponent(sessionKey)}&fitem=S&salvar=S&useCache=N`;
      console.log(`[Sankhya] Upload canhoto via sessionUpload: sessionkey=${sessionKey}, size=${imageBytes.length} bytes, file=${internalName}`);

      const doUpload = async (authToken: string) => {
        return await fetch(sessionUploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Accept': 'text/html',
          },
          body: multipartBody,
        });
      };

      let uploadResponse = await doUpload(token);

      if (uploadResponse.status === 401) {
        console.log('[Sankhya] Token expirado, re-autenticando...');
        tokenCache.accessToken = null;
        const newToken = await authenticate();
        uploadResponse = await doUpload(newToken);
      }

      const uploadText = await uploadResponse.text();
      console.log(`[Sankhya] sessionUpload status: ${uploadResponse.status}`);
      console.log('[Sankhya] sessionUpload body:', uploadText.substring(0, 500));

      if (!uploadResponse.ok) {
        console.error('[Sankhya] sessionUpload falhou:', uploadResponse.status, uploadText);
        return new Response(
          JSON.stringify({ success: false, error: `sessionUpload falhou: ${uploadResponse.status}`, nunota: nunotaInt }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Step 3b: Save/update AD_CANHOTOS record with $file.session.key reference
      // This tells Sankhya to take the file from the session and store it in the CANHOTO2 image field
      const fileSessionRef = `$file.session.key{${sessionKey}}`;
      console.log(`[Sankhya] Salvando registro com CANHOTO2 = ${fileSessionRef}`);

      try {
        try {
          const saveFields2: Record<string, any> = { NUNOTA: nunotaInt, NUMNOTA: numnotaInt, CANHOTO2: fileSessionRef };
          if (body.codparc) saveFields2.CODPARC = parseInt(String(body.codparc), 10);
          if (body.vlrnota !== undefined && body.vlrnota !== null) saveFields2.VLRNOTA = parseFloat(String(body.vlrnota));
          if (body.dtneg) saveFields2.DTNEG = formatDtnegForCrud(body.dtneg);
          if (body.codvend) saveFields2.CODVEND = parseInt(String(body.codvend), 10);
          await saveCrudRecord('AD_CANHOTOS', saveFields2);
        } catch (insertErr) {
          const msg = insertErr instanceof Error ? insertErr.message : '';
          if (msg.includes('PRIMARY KEY') || msg.includes('duplicada') || msg.includes('duplicate')) {
            console.log('[Sankhya] Registro já existe, atualizando campo CANHOTO2...');
            const updateFields2: Record<string, any> = { CANHOTO2: fileSessionRef };
            if (body.codparc) updateFields2.CODPARC = parseInt(String(body.codparc), 10);
            if (body.vlrnota !== undefined && body.vlrnota !== null) updateFields2.VLRNOTA = parseFloat(String(body.vlrnota));
            if (body.dtneg) updateFields2.DTNEG = formatDtnegForCrud(body.dtneg);
            if (body.codvend) updateFields2.CODVEND = parseInt(String(body.codvend), 10);
            await updateCrudRecord('AD_CANHOTOS', { NUNOTA: nunotaInt }, updateFields2);
          } else {
            throw insertErr;
          }
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Canhoto uploaded and linked to CANHOTO2 image field', 
            nunota: nunotaInt, 
            uploadStatus: uploadResponse.status,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (saveError) {
        const errMsg = saveError instanceof Error ? saveError.message : 'Erro desconhecido';
        console.error('[Sankhya] Erro ao salvar registro com referência de sessão:', errMsg);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Upload OK mas erro ao vincular: ${errMsg}`,
            nunota: nunotaInt, 
            uploadStatus: uploadResponse.status,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Action: migrateCanhotos - batch migrate canhotos from storage to Sankhya
    if (action === 'migrateCanhotos') {
      const { canhotos } = body;
      if (!Array.isArray(canhotos) || canhotos.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'canhotos é obrigatório (array)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const results: { nunota: number; success: boolean; error?: string }[] = [];
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      for (const c of canhotos) {
        const nunotaInt = parseInt(String(c.nunota), 10);
        const numnotaInt = parseInt(String(c.numnota), 10);
        const storagePath = c.storagePath;

        try {
          // 1. Create AD_CANHOTOS record
          try {
            const crudFields: Record<string, any> = { NUNOTA: nunotaInt, NUMNOTA: numnotaInt };
            if (c.codparc) crudFields.CODPARC = parseInt(String(c.codparc), 10);
            if (c.vlrnota !== undefined && c.vlrnota !== null) crudFields.VLRNOTA = parseFloat(String(c.vlrnota));
            if (c.dtneg) crudFields.DTNEG = formatDtnegForCrud(c.dtneg);
            if (c.codvend) crudFields.CODVEND = parseInt(String(c.codvend), 10);
            await saveCrudRecord('AD_CANHOTOS', crudFields);
          } catch (_e) { /* may exist */ }

          // 2. Download from bucket
          const dlResponse = await fetch(`${supabaseUrl}/storage/v1/object/canhotos/${storagePath}`, {
            headers: { 'Authorization': `Bearer ${serviceKey}` },
          });
          if (!dlResponse.ok) {
            results.push({ nunota: nunotaInt, success: false, error: `Download falhou: ${dlResponse.status}` });
            continue;
          }
          const mimeType = dlResponse.headers.get('content-type') || 'image/jpeg';
          const imageBytes = new Uint8Array(await dlResponse.arrayBuffer());

          // 3. Upload via sessionUpload.mge
          const token = await authenticate();
          const gatewayUrl = Deno.env.get('SANKHYA_GATEWAY_URL')!;
          const ext = mimeType.includes('png') ? 'png' : 'jpg';
          const internalName = `canhoto_${nunotaInt}.${ext}`;
          const sessionKey = 'AD_CANHOTOS_CANHOTO2';

          const boundary = `----FormBoundary${Date.now()}${Math.random().toString(36).substring(2)}`;
          const headerPart = `--${boundary}\r\nContent-Disposition: form-data; name="arquivo"; filename="${internalName}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
          const footerPart = `\r\n--${boundary}--\r\n`;
          const headerBytes = new TextEncoder().encode(headerPart);
          const footerBytes = new TextEncoder().encode(footerPart);
          const multipartBody = new Uint8Array(headerBytes.length + imageBytes.length + footerBytes.length);
          multipartBody.set(headerBytes, 0);
          multipartBody.set(imageBytes, headerBytes.length);
          multipartBody.set(footerBytes, headerBytes.length + imageBytes.length);

          const sessionUploadUrl = `${gatewayUrl}/gateway/v1/mge/sessionUpload.mge?sessionkey=${encodeURIComponent(sessionKey)}&fitem=S&salvar=S&useCache=N`;
          
          const doSessionUpload = async (authToken: string) => {
            return await fetch(sessionUploadUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Accept': 'text/html',
              },
              body: multipartBody,
            });
          };

          let uploadResp = await doSessionUpload(token);
          if (uploadResp.status === 401) {
            tokenCache.accessToken = null;
            const newToken2 = await authenticate();
            uploadResp = await doSessionUpload(newToken2);
          }

          const uploadRespText = await uploadResp.text();
          console.log(`[Sankhya] Migrate NUNOTA=${nunotaInt}: sessionUpload status=${uploadResp.status}`);

          if (!uploadResp.ok) {
            console.error(`[Sankhya] Migrate NUNOTA=${nunotaInt}: sessionUpload falhou:`, uploadRespText.substring(0, 300));
            results.push({ nunota: nunotaInt, success: false, error: `sessionUpload falhou: ${uploadResp.status}` });
            continue;
          }

          // 4. Link file to CANHOTO2 field
          const fileSessionRef = `$file.session.key{${sessionKey}}`;
          try {
            const saveFields: Record<string, any> = { NUNOTA: nunotaInt, NUMNOTA: numnotaInt, CANHOTO2: fileSessionRef };
            if (c.codparc) saveFields.CODPARC = parseInt(String(c.codparc), 10);
            if (c.vlrnota !== undefined && c.vlrnota !== null) saveFields.VLRNOTA = parseFloat(String(c.vlrnota));
            if (c.dtneg) saveFields.DTNEG = formatDtnegForCrud(c.dtneg);
            if (c.codvend) saveFields.CODVEND = parseInt(String(c.codvend), 10);
            await saveCrudRecord('AD_CANHOTOS', saveFields);
          } catch (insertErr) {
            const msg = insertErr instanceof Error ? insertErr.message : '';
            if (msg.includes('PRIMARY KEY') || msg.includes('duplicada') || msg.includes('duplicate')) {
              const updateFields: Record<string, any> = { CANHOTO2: fileSessionRef };
              if (c.codparc) updateFields.CODPARC = parseInt(String(c.codparc), 10);
              if (c.vlrnota !== undefined && c.vlrnota !== null) updateFields.VLRNOTA = parseFloat(String(c.vlrnota));
              if (c.dtneg) updateFields.DTNEG = formatDtnegForCrud(c.dtneg);
              if (c.codvend) updateFields.CODVEND = parseInt(String(c.codvend), 10);
              await updateCrudRecord('AD_CANHOTOS', { NUNOTA: nunotaInt }, updateFields);
            } else {
              throw insertErr;
            }
          }

          // 5. Delete from bucket
          const delResponse = await fetch(`${supabaseUrl}/storage/v1/object/remove/canhotos`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prefixes: [storagePath] }),
          });
          const delText = await delResponse.text();
          console.log(`[Sankhya] Migrate NUNOTA=${nunotaInt}: upload OK, bucket delete=${delResponse.status}, body=${delText.substring(0, 200)}`);
          results.push({ nunota: nunotaInt, success: true });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Erro desconhecido';
          console.error(`[Sankhya] Migrate NUNOTA=${nunotaInt} falhou:`, errMsg);
          results.push({ nunota: nunotaInt, success: false, error: errMsg });
        }
      }

      const successCount = results.filter(r => r.success).length;
      return new Response(
        JSON.stringify({ success: true, message: `${successCount}/${results.length} canhotos migrados`, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: retryAllCanhotos - query DB for all pending canhotos and migrate them in batches
    if (action === 'retryAllCanhotos') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const batchSize = body.batchSize || 10;
      const offset = body.offset || 0;

      // Query canhotos from finalized acertos that still have foto_canhoto_url (file in bucket)
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const sb = createClient(supabaseUrl, serviceKey);

      const { data: pendingCanhotos, error: dbErr } = await sb
        .from('acerto_pedidos')
        .select('numero_pedido, numero_unico, foto_canhoto_url, cliente_nome, acertos!inner(numero_ordem_carga, status)')
        .eq('acertos.status', 'finalizado')
        .not('foto_canhoto_url', 'is', null)
        .neq('numero_pedido', 'Sem pedidos')
        .order('created_at', { ascending: true })
        .range(offset, offset + batchSize - 1);

      if (dbErr) {
        return new Response(JSON.stringify({ success: false, error: dbErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (!pendingCanhotos || pendingCanhotos.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: 'Nenhum canhoto pendente encontrado', total: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const results: { nunota: number; numnota: number; success: boolean; error?: string; skipped?: boolean }[] = [];
      let skippedCount = 0;

      for (const c of pendingCanhotos) {
        // numero_pedido in DB stores NUNOTA, numero_unico stores NUMNOTA
        const nunotaInt = parseInt(String(c.numero_pedido), 10);
        const numnotaInt = parseInt(String(c.numero_unico || '0'), 10);
        const storagePath = c.foto_canhoto_url;

        try {
          // 0. Check if NUNOTA already exists in AD_CANHOTOS on Sankhya - skip if so
          try {
            const checkSql = `SELECT NUNOTA, CANHOTO2 FROM AD_CANHOTOS WHERE NUNOTA = ${nunotaInt}`;
            const checkResult = await executeQuery(checkSql);
            const checkRows = parseDbExplorerResponse(checkResult);
            if (checkRows.length > 0 && checkRows[0].CANHOTO2) {
              // Already exists with image - skip
              skippedCount++;
              results.push({ nunota: nunotaInt, numnota: numnotaInt, success: true, skipped: true });
              continue;
            }
          } catch (_checkErr) {
            // If check fails, proceed with upload
          }

          // 1. Download from bucket - if file doesn't exist, it was already migrated
          const dlResponse = await fetch(`${supabaseUrl}/storage/v1/object/canhotos/${storagePath}`, {
            headers: { 'Authorization': `Bearer ${serviceKey}` },
          });
          if (!dlResponse.ok) {
            // File already deleted from bucket = already migrated
            skippedCount++;
            results.push({ nunota: nunotaInt, numnota: numnotaInt, success: true, skipped: true });
            continue;
          }
          const mimeType = dlResponse.headers.get('content-type') || 'image/jpeg';
          const imageBytes = new Uint8Array(await dlResponse.arrayBuffer());

          // 2. Fetch metadata from Sankhya (CODPARC, CODVEND, VLRNOTA, DTNEG)
          let codparc: number | null = null;
          let codvend: number | null = null;
          let vlrnota: number | null = null;
          let dtneg: string | null = null;
          try {
            const metaSql = `SELECT CAB.CODPARC, CAB.CODVEND, CAB.VLRNOTA, CAB.DTNEG FROM TGFCAB CAB WHERE CAB.NUNOTA = ${nunotaInt}`;
            const metaResult = await executeQuery(metaSql);
            const metaRows = parseDbExplorerResponse(metaResult);
            if (metaRows.length > 0) {
              codparc = metaRows[0].CODPARC ? parseInt(String(metaRows[0].CODPARC), 10) : null;
              codvend = metaRows[0].CODVEND ? parseInt(String(metaRows[0].CODVEND), 10) : null;
              vlrnota = metaRows[0].VLRNOTA ? parseFloat(String(metaRows[0].VLRNOTA)) : null;
              dtneg = metaRows[0].DTNEG ? String(metaRows[0].DTNEG) : null;
              console.log(`[Sankhya] Retry NUNOTA=${nunotaInt}: meta CODPARC=${codparc}, CODVEND=${codvend}, VLRNOTA=${vlrnota}, DTNEG=${dtneg}`);
            }
          } catch (metaErr) {
            console.warn(`[Sankhya] Retry NUNOTA=${nunotaInt}: erro ao buscar metadados:`, metaErr instanceof Error ? metaErr.message : metaErr);
          }

          // 2b. Create AD_CANHOTOS record with metadata
          try {
            const crudFields: Record<string, any> = { NUNOTA: nunotaInt, NUMNOTA: numnotaInt };
            if (codparc) crudFields.CODPARC = codparc;
            if (vlrnota !== null) crudFields.VLRNOTA = vlrnota;
            if (dtneg) crudFields.DTNEG = formatDtnegForCrud(dtneg);
            if (codvend) crudFields.CODVEND = codvend;
            await saveCrudRecord('AD_CANHOTOS', crudFields);
          } catch (_e) { /* may exist */ }

          // 3. Upload via sessionUpload.mge with proper headers
          const token = await authenticate();
          const gatewayUrl = Deno.env.get('SANKHYA_GATEWAY_URL')!;
          const ext = mimeType.includes('png') ? 'png' : 'jpg';
          const internalName = `canhoto_${nunotaInt}.${ext}`;
          const sessionKey = 'AD_CANHOTOS_CANHOTO2';

          const boundary = `----FormBoundary${Date.now()}${Math.random().toString(36).substring(2)}`;
          const headerPart = `--${boundary}\r\nContent-Disposition: form-data; name="arquivo"; filename="${internalName}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
          const footerPart = `\r\n--${boundary}--\r\n`;
          const headerBytes = new TextEncoder().encode(headerPart);
          const footerBytes = new TextEncoder().encode(footerPart);
          const multipartBody = new Uint8Array(headerBytes.length + imageBytes.length + footerBytes.length);
          multipartBody.set(headerBytes, 0);
          multipartBody.set(imageBytes, headerBytes.length);
          multipartBody.set(footerBytes, headerBytes.length + imageBytes.length);

          const sessionUploadUrl = `${gatewayUrl}/gateway/v1/mge/sessionUpload.mge?sessionkey=${encodeURIComponent(sessionKey)}&fitem=S&salvar=S&useCache=N`;
          
          const doRetryUpload = async (authToken: string) => {
            return await fetch(sessionUploadUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Accept': 'text/html',
              },
              body: multipartBody,
            });
          };

          let uploadResp = await doRetryUpload(token);
          if (uploadResp.status === 401) {
            tokenCache.accessToken = null;
            const newToken = await authenticate();
            uploadResp = await doRetryUpload(newToken);
          }

          const uploadText = await uploadResp.text();
          if (!uploadResp.ok) {
            console.error(`[Sankhya] Retry NUNOTA=${nunotaInt}: sessionUpload falhou: ${uploadResp.status}`);
            results.push({ nunota: nunotaInt, numnota: numnotaInt, success: false, error: `sessionUpload falhou: ${uploadResp.status}` });
            continue;
          }

          // 4. Link file to CANHOTO2 field with metadata
          const fileSessionRef = `$file.session.key{${sessionKey}}`;
          const saveFields: Record<string, any> = { NUNOTA: nunotaInt, NUMNOTA: numnotaInt, CANHOTO2: fileSessionRef };
          if (codparc) saveFields.CODPARC = codparc;
          if (vlrnota !== null) saveFields.VLRNOTA = vlrnota;
          if (dtneg) saveFields.DTNEG = formatDtnegForCrud(dtneg);
          if (codvend) saveFields.CODVEND = codvend;
          try {
            await saveCrudRecord('AD_CANHOTOS', saveFields);
          } catch (insertErr) {
            const msg = insertErr instanceof Error ? insertErr.message : '';
            if (msg.includes('PRIMARY KEY') || msg.includes('duplicada') || msg.includes('duplicate')) {
              const { NUNOTA: _n, NUMNOTA: _m, ...updateFields } = saveFields;
              await updateCrudRecord('AD_CANHOTOS', { NUNOTA: nunotaInt }, updateFields);
            } else {
              throw insertErr;
            }
          }

          // 5. Delete from bucket after successful upload
          const delResponse = await fetch(`${supabaseUrl}/storage/v1/object/remove/canhotos`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prefixes: [storagePath] }),
          });
          const delText2 = await delResponse.text();
          console.log(`[Sankhya] Retry NUNOTA=${nunotaInt}: upload OK, bucket delete=${delResponse.status}, body=${delText2.substring(0, 200)}`);
          results.push({ nunota: nunotaInt, numnota: numnotaInt, success: true });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Erro desconhecido';
          console.error(`[Sankhya] Retry NUNOTA=${nunotaInt} falhou:`, errMsg);
          results.push({ nunota: nunotaInt, numnota: numnotaInt, success: false, error: errMsg });
        }
      }

      const successCount = results.filter(r => r.success).length;
      return new Response(
        JSON.stringify({
          success: true,
          message: `${successCount}/${results.length} canhotos processados (${skippedCount} já migrados, offset=${offset})`,
          results,
          hasMore: pendingCanhotos.length === batchSize,
          nextOffset: offset + batchSize,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: batchResyncAcertos - re-sync all finalized acertos to Sankhya
    if (action === 'batchResyncAcertos') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const sb = createClient(supabaseUrl, supabaseKey);

      const statusMap: Record<string, number> = {
        entregue: 1, devolvido: 5, reentrega: 3, pendente: 8, nao_carregado: 9,
      };

      // Get all finalized acerto pedidos
      const { data: rows, error: dbErr } = await sb
        .from('acerto_pedidos')
        .select('numero_pedido, status_entrega, acertos!inner(numero_ordem_carga, status)')
        .eq('acertos.status', 'finalizado')
        .neq('numero_pedido', 'Sem pedidos');

      if (dbErr) {
        return new Response(JSON.stringify({ success: false, error: dbErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Deduplicate by (OC, NUNOTA) keeping first occurrence
      const seen = new Set<string>();
      const unique = (rows || []).filter((r: any) => {
        const key = `${r.acertos.numero_ordem_carga}_${r.numero_pedido}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      console.log(`[Sankhya] batchResync: ${unique.length} pedidos únicos para re-sincronizar`);

      const batchSize = body.batchSize || 20;
      const offset = body.offset || 0;
      const batch = unique.slice(offset, offset + batchSize);

      const results: any[] = [];
      for (const row of batch) {
        const nunota = parseInt(row.numero_pedido, 10);
        const oc = parseInt((row as any).acertos.numero_ordem_carga, 10);
        const status = statusMap[row.status_entrega] || 8;

        try {
          const checkSql = `SELECT NUNOTA FROM AD_NFACERTO WHERE NUNOTA = ${nunota} AND ORDEMCARGA = ${oc}`;
          const checkResult = await executeQuery(checkSql);
          const existing = parseDbExplorerResponse(checkResult);

          if (existing.length === 0) {
            await saveCrudRecord('AD_NFACERTO', { NUNOTA: nunota, ORDEMCARGA: oc, STATUS: status });
            results.push({ nunota, oc, status, action: 'inserted', success: true });
          } else {
            await updateCrudRecord('AD_NFACERTO', { NUNOTA: nunota, ORDEMCARGA: oc }, { STATUS: status });
            results.push({ nunota, oc, status, action: 'updated', success: true });
          }
        } catch (e) {
          results.push({ nunota, oc, status, action: 'error', success: false, error: e instanceof Error ? e.message : String(e) });
        }
      }

      const successCount = results.filter(r => r.success).length;
      return new Response(JSON.stringify({
        success: true,
        message: `${successCount}/${batch.length} pedidos sincronizados (offset=${offset}, total=${unique.length})`,
        results,
        totalPedidos: unique.length,
        hasMore: offset + batchSize < unique.length,
        nextOffset: offset + batchSize,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Action: cleanBucket - delete files from canhotos bucket (processes one folder per call)
    if (action === 'cleanBucket') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const sb = createClient(supabaseUrl, serviceKey);

      let totalDeleted = 0;

      // List top-level items (folders = acerto UUIDs)
      const { data: topItems, error: listErr } = await sb.storage
        .from('canhotos')
        .list('', { limit: 100 });

      if (listErr || !topItems || topItems.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: 'Bucket já está vazio', totalDeleted: 0, hasMore: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Process each folder
      for (const item of topItems) {
        if (!item.id) {
          // It's a folder - list and delete its contents
          const { data: subFiles } = await sb.storage
            .from('canhotos')
            .list(item.name, { limit: 1000 });
          if (subFiles && subFiles.length > 0) {
            const paths = subFiles.filter(f => f.id).map(f => `${item.name}/${f.name}`);
            if (paths.length > 0) {
              const { error: delErr } = await sb.storage.from('canhotos').remove(paths);
              if (!delErr) totalDeleted += paths.length;
              else console.error(`[cleanBucket] Erro deletando ${item.name}:`, delErr.message);
            }
          }
        } else {
          // It's a file at root level
          const { error: delErr } = await sb.storage.from('canhotos').remove([item.name]);
          if (!delErr) totalDeleted += 1;
        }
      }

      console.log(`[cleanBucket] Deletados ${totalDeleted} arquivos nesta rodada`);

      // Check if there are more
      const { data: remaining } = await sb.storage.from('canhotos').list('', { limit: 1 });
      const hasMore = !!(remaining && remaining.length > 0);

      return new Response(
        JSON.stringify({ success: true, message: `${totalDeleted} arquivos deletados`, totalDeleted, hasMore }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Action inválida.' }),
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
