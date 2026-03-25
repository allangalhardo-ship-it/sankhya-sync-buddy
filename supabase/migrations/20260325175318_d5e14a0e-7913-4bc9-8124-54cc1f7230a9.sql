CREATE POLICY "All authenticated users can update logistics checklist"
ON public.acerto_devolucoes
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);