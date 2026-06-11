
-- Enum de papéis
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- ============ USER_ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ============ GAMES ============
CREATE TABLE public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_home TEXT NOT NULL,
  team_away TEXT NOT NULL,
  match_at TIMESTAMPTZ NOT NULL,
  score_home INT,
  score_away INT,
  scorer TEXT,
  closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.games TO authenticated;
GRANT ALL ON public.games TO service_role;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone logged in can view games" ON public.games FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert games" ON public.games FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update games" ON public.games FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete games" ON public.games FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ============ PREDICTIONS ============
CREATE TABLE public.predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guess_home INT NOT NULL,
  guess_away INT NOT NULL,
  guess_scorer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(game_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.predictions TO authenticated;
GRANT ALL ON public.predictions TO service_role;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View own predictions or of closed games" ON public.predictions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND g.closed));
CREATE POLICY "Insert own predictions on open games" ON public.predictions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND NOT g.closed));
CREATE POLICY "Update own predictions on open games" ON public.predictions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND NOT g.closed));
CREATE POLICY "Delete own predictions on open games" ON public.predictions FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND NOT g.closed));

-- ============ RANKING VIEW ============
CREATE OR REPLACE VIEW public.rankings AS
SELECT
  p.id AS user_id,
  p.display_name,
  COALESCE(SUM(
    CASE WHEN g.closed THEN
      (CASE WHEN pr.guess_home = g.score_home AND pr.guess_away = g.score_away THEN 3 ELSE 0 END) +
      (CASE WHEN pr.guess_home <> g.score_home OR pr.guess_away <> g.score_away THEN
        CASE
          WHEN sign(pr.guess_home - pr.guess_away) = sign(g.score_home - g.score_away) THEN 1
          ELSE 0
        END
      ELSE 0 END) +
      (CASE WHEN pr.guess_scorer IS NOT NULL AND g.scorer IS NOT NULL
                 AND lower(trim(pr.guess_scorer)) = lower(trim(g.scorer)) THEN 1 ELSE 0 END)
    ELSE 0 END
  ), 0)::int AS points
FROM public.profiles p
LEFT JOIN public.predictions pr ON pr.user_id = p.id
LEFT JOIN public.games g ON g.id = pr.game_id
GROUP BY p.id, p.display_name;

GRANT SELECT ON public.rankings TO authenticated, anon;

-- ============ TRIGGERS: criar profile + role no signup ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_first BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN is_first THEN 'admin'::app_role ELSE 'user'::app_role END);

  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.predictions;
