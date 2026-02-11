
-- Add status and logistics fields to acerto_devolucoes
ALTER TABLE public.acerto_devolucoes
  ADD COLUMN status TEXT NOT NULL DEFAULT 'pendente_logistica',
  ADD COLUMN logistica_data TIMESTAMP WITH TIME ZONE,
  ADD COLUMN logistica_responsavel TEXT,
  ADD COLUMN logistica_nf_entrada TEXT,
  ADD COLUMN logistica_nf_substituicao TEXT,
  ADD COLUMN logistica_ajuste_estoque BOOLEAN DEFAULT false,
  ADD COLUMN logistica_conferencia_nota_cega BOOLEAN DEFAULT false,
  ADD COLUMN logistica_numero_nota_cega TEXT,
  ADD COLUMN logistica_concluido_at TIMESTAMP WITH TIME ZONE;
