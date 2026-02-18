import { supabase } from "@/integrations/supabase/client";

export interface SankhyaResponse<T = unknown> {
  success: boolean;
  status?: number;
  data?: T;
  error?: string;
  message?: string;
  rawResponse?: unknown;
  total?: number;
}

export interface CabecalhoData {
  ORDEMCARGA: number;
  NOMEPARC: string;
  CODPARC: number;
  AD_DATAHORASADA: string;
  VLRFRETE: string;
  NOMEREG: string;
  DATAAT: string;
  VALOR: number;
  PESO: number;
  M3: number;
  QTDPEDIDO: number;
  TIPVEI: string;
  QTDCLI: number;
  AD_KTTOT: number;
  AD_NROTA: string;
  AD_HRINIRT: string;
}

export interface PedidoData {
  ORDEMCARGA: number;
  PLACA: string;
  NOMEPARC: string;
  CODPARC: number;
  MARCAMODELO: string;
  ENDERECO: string;
  CODIGO_DO_CLIENTE: number;
  NOME_DO_CLIENTE: string;
  COMPLEMENTO: string;
  VALOR_NOTA: number;
  PESO_KG: number;
  M3UN: number;
  TELEFONE: string;
  NUNOTA: number;
  STATUS_ACERTO?: number | null;
  VENDEDOR?: string;
  NUMNOTA: number;
  DESCRTIPPARC: string;
  CARTASELO: string;
  AGENDAMENTO: string;
  PRIORIDADE: string;
  SEQCARGA: number;
  REENT: string;
  NOMEREG: string;
  CODVEND?: number;
  DTNEG?: string;
}

export const sankhya = {
  async testConnection(): Promise<SankhyaResponse> {
    const { data, error } = await supabase.functions.invoke("sankhya-api", {
      body: { action: "test" },
    });
    if (error) return { success: false, error: error.message };
    return data;
  },

  async getCabecalho(ordemCarga: string): Promise<SankhyaResponse<CabecalhoData>> {
    const { data, error } = await supabase.functions.invoke("sankhya-api", {
      body: { action: "getCabecalho", ordemCarga },
    });
    if (error) return { success: false, error: error.message };
    return data;
  },

  async getPedidos(ordemCarga: string): Promise<SankhyaResponse<PedidoData[]>> {
    const { data, error } = await supabase.functions.invoke("sankhya-api", {
      body: { action: "getPedidos", ordemCarga },
    });
    if (error) return { success: false, error: error.message };
    return data;
  },

  async saveAcerto(pedidos: { nunota: number; ordemCarga: number; status: number }[]): Promise<SankhyaResponse> {
    const { data, error } = await supabase.functions.invoke("sankhya-api", {
      body: { action: "saveAcerto", pedidos },
    });
    if (error) return { success: false, error: error.message };
    return data;
  },

  async getMotivosDevol(): Promise<SankhyaResponse<{ CODIGO: number; DESCRICAO: string }[]>> {
    const { data, error } = await supabase.functions.invoke("sankhya-api", {
      body: { action: "getMotivosDevol" },
    });
    if (error) return { success: false, error: error.message };
    return data;
  },

  async uploadCanhoto(nunota: number, numnota: number, imageBase64?: string, imageMimeType?: string, storagePath?: string): Promise<SankhyaResponse> {
    const { data, error } = await supabase.functions.invoke("sankhya-api", {
      body: { action: "uploadCanhoto", nunota, numnota, imageBase64, imageMimeType, storagePath },
    });
    if (error) return { success: false, error: error.message };
    return data;
  },

  async migrateCanhotos(canhotos: { nunota: number; numnota: number; storagePath: string; codparc?: number; vlrnota?: number; dtneg?: string; codvend?: number }[]): Promise<SankhyaResponse> {
    const { data, error } = await supabase.functions.invoke("sankhya-api", {
      body: { action: "migrateCanhotos", canhotos },
    });
    if (error) return { success: false, error: error.message };
    return data;
  },

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<SankhyaResponse<T>> {
    const { data, error } = await supabase.functions.invoke("sankhya-api", {
      body: { action: "request", method, path, body },
    });
    if (error) return { success: false, error: error.message };
    return data;
  },
};
