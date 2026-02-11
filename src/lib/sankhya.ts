import { supabase } from "@/integrations/supabase/client";

export interface SankhyaResponse<T = unknown> {
  success: boolean;
  status?: number;
  data?: T;
  error?: string;
  message?: string;
}

export const sankhya = {
  async testConnection(): Promise<SankhyaResponse> {
    const { data, error } = await supabase.functions.invoke("sankhya-api", {
      body: { action: "test" },
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

  async getOrdemCarga(codigo: string) {
    return this.request("GET", `/api/v1/ordens-carga/${codigo}`);
  },

  async getPedidosOrdemCarga(codigo: string) {
    return this.request("GET", `/api/v1/ordens-carga/${codigo}/pedidos`);
  },

  async getClientes() {
    return this.request("GET", "/api/v1/clientes");
  },

  async getProdutos() {
    return this.request("GET", "/api/v1/produtos");
  },

  async getEmpresas() {
    return this.request("GET", "/api/v1/empresas");
  },
};
