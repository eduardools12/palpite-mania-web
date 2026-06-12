CREATE TABLE public.season_predictions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  artilheiro TEXT,
  campeao TEXT,
  time_revelacao TEXT,
  selecao_carisma TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.season_predictions TO authenticated;
GRANT ALL ON public.season_predictions TO service_role;

ALTER TABLE public.season_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own season predictions"
  ON public.season_predictions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all season predictions"
  ON public.season_predictions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_season_predictions_updated_at
  BEFORE UPDATE ON public.season_predictions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();