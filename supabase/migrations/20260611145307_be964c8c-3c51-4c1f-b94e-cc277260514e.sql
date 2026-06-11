
-- 1) Remover predictions do realtime para não vazar palpites de outros usuários
ALTER PUBLICATION supabase_realtime DROP TABLE public.predictions;

-- 2) Bloquear explicitamente escritas em user_roles por usuários comuns
CREATE POLICY "No client inserts on user_roles"
  ON public.user_roles FOR INSERT TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "No client updates on user_roles"
  ON public.user_roles FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

CREATE POLICY "No client deletes on user_roles"
  ON public.user_roles FOR DELETE TO authenticated, anon
  USING (false);
