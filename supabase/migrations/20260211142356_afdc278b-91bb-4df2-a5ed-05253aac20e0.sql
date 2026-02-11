
-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  nome TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Acertos (settlement records)
CREATE TABLE public.acertos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrega', 'devolucao')),
  numero_ordem_carga TEXT NOT NULL,
  motorista_nome TEXT,
  placa TEXT,
  status TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'finalizado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_at TIMESTAMPTZ
);

ALTER TABLE public.acertos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own acertos" ON public.acertos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own acertos" ON public.acertos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own acertos" ON public.acertos FOR UPDATE USING (auth.uid() = user_id);

-- Acerto pedidos (individual orders)
CREATE TABLE public.acerto_pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acerto_id UUID REFERENCES public.acertos(id) ON DELETE CASCADE NOT NULL,
  numero_pedido TEXT NOT NULL,
  numero_unico TEXT,
  cliente_nome TEXT,
  endereco TEXT,
  status_entrega TEXT NOT NULL DEFAULT 'pendente' CHECK (status_entrega IN ('pendente', 'entregue', 'devolvido', 'reentrega')),
  observacao TEXT,
  foto_canhoto_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.acerto_pedidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view acerto pedidos" ON public.acerto_pedidos FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.acertos WHERE id = acerto_pedidos.acerto_id AND user_id = auth.uid()));
CREATE POLICY "Users can insert acerto pedidos" ON public.acerto_pedidos FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.acertos WHERE id = acerto_pedidos.acerto_id AND user_id = auth.uid()));
CREATE POLICY "Users can update acerto pedidos" ON public.acerto_pedidos FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.acertos WHERE id = acerto_pedidos.acerto_id AND user_id = auth.uid()));

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_acerto_pedidos_updated_at
  BEFORE UPDATE ON public.acerto_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for canhoto photos
INSERT INTO storage.buckets (id, name, public) VALUES ('canhotos', 'canhotos', false);

CREATE POLICY "Authenticated users can upload canhotos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'canhotos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view canhotos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'canhotos' AND auth.role() = 'authenticated');
