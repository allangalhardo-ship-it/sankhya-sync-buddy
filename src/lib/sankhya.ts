import { supabase } from "@/integrations/supabase/client";

export interface SankhyaResponse<T = unknown> {
  success: boolean;
  status?: number;
  data?: T;
  error?: string;
  message?: string;
}

export const sankhya = {
  /**
   * Testa a conexão com a API Sankhya
   */
  async testConnection(): Promise<SankhyaResponse> {
    const { data, error } = await supabase.functions.invoke("sankhya-api", {
      body: { action: "test" },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return data;
  },

  /**
   * Faz uma requisição genérica à API Sankhya
   */
  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<SankhyaResponse<T>> {
    const { data, error } = await supabase.functions.invoke("sankhya-api", {
      body: { action: "request", method, path, body },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return data;
  },

  // Atalhos para endpoints comuns
  async getClientes() {
    return this.request("GET", "/api/v1/clientes");
  },

  async getProdutos() {
    return this.request("GET", "/api/v1/produtos");
  },

  async getEstoque(codigoProduto: string) {
    return this.request("GET", `/api/v1/estoque/produtos/${codigoProduto}`);
  },

  async getPedidos() {
    return this.request("GET", "/api/v1/pedidos");
  },

  async getEmpresas() {
    return this.request("GET", "/api/v1/empresas");
  },

  async getVendedores() {
    return this.request("GET", "/api/v1/vendedores");
  },
};
