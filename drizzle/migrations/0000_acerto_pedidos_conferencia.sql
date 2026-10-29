ALTER TABLE public.acerto_pedidos ADD COLUMN IF NOT EXISTS conferido boolean NOT NULL DEFAULT false;
ALTER TABLE public.acerto_pedidos ADD COLUMN IF NOT EXISTS link_canhoto text;
ALTER TABLE public.acerto_pedidos ADD COLUMN IF NOT EXISTS origem_status text;