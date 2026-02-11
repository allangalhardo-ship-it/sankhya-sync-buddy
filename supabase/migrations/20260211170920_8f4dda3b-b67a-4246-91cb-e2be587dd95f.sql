
CREATE TABLE public.acerto_devolucoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  acerto_id UUID NOT NULL REFERENCES public.acertos(id),
  numero_pedido TEXT NOT NULL,
  cliente_nome TEXT,
  tipo_devolucao TEXT NOT NULL DEFAULT 'total',
  agregado TEXT,
  nf_fr TEXT,
  nf_cliente TEXT,
  parceiro TEXT,
  vendedor TEXT,
  motivo TEXT,
  conferencia_produtos TEXT NOT NULL DEFAULT 'sim',
  desconta_taxa_vendedor TEXT NOT NULL DEFAULT 'nao',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.acerto_devolucoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own devolucoes"
ON public.acerto_devolucoes FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM acertos WHERE acertos.id = acerto_devolucoes.acerto_id AND acertos.user_id = auth.uid()
));

CREATE POLICY "Users can view own devolucoes"
ON public.acerto_devolucoes FOR SELECT
USING (EXISTS (
  SELECT 1 FROM acertos WHERE acertos.id = acerto_devolucoes.acerto_id AND acertos.user_id = auth.uid()
));

CREATE POLICY "Users can update own devolucoes"
ON public.acerto_devolucoes FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM acertos WHERE acertos.id = acerto_devolucoes.acerto_id AND acertos.user_id = auth.uid()
));
