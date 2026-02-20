
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_abandoned_acertos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete acerto_pedidos for abandoned acertos
  DELETE FROM acerto_pedidos
  WHERE acerto_id IN (
    SELECT a.id FROM acertos a
    WHERE a.status = 'em_andamento'
      AND a.created_at < now() - interval '48 hours'
      AND NOT EXISTS (
        SELECT 1 FROM acerto_pedidos ap
        WHERE ap.acerto_id = a.id
          AND ap.status_entrega != 'pendente'
      )
  );

  -- Delete the abandoned acertos themselves
  WITH deleted AS (
    DELETE FROM acertos a
    WHERE a.status = 'em_andamento'
      AND a.created_at < now() - interval '48 hours'
      AND NOT EXISTS (
        SELECT 1 FROM acerto_pedidos ap
        WHERE ap.acerto_id = a.id
      )
    RETURNING id
  )
  SELECT count(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$;
