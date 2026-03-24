CREATE POLICY "All users can view pending logistics"
ON public.acerto_devolucoes
FOR SELECT
TO authenticated
USING (status = 'pendente_logistica');