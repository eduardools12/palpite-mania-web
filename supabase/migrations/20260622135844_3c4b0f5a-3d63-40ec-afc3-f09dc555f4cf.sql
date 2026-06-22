
-- ============================================================
-- Migração 1: catálogo de jogadores oficiais (API-Football)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public.players (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_player_id   integer NOT NULL UNIQUE,
  name            text    NOT NULL,
  photo           text,
  position        text,
  team_id         integer,
  team_name       text,
  nationality     text,
  age             integer,
  height          text,
  weight          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.players TO authenticated;
GRANT ALL    ON public.players TO service_role;

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players visible to authenticated"
  ON public.players FOR SELECT TO authenticated USING (true);

CREATE INDEX players_name_trgm_idx ON public.players USING gin (name gin_trgm_ops);
CREATE INDEX players_team_id_idx   ON public.players (team_id);

CREATE TRIGGER update_players_updated_at
  BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Migração 2: vincular games/predictions a IDs da API-Football
-- ============================================================
ALTER TABLE public.games
  ADD COLUMN api_fixture_id     integer UNIQUE,
  ADD COLUMN api_league_id      integer,
  ADD COLUMN api_season         integer,
  ADD COLUMN round              text,
  ADD COLUMN stage              text,
  ADD COLUMN status             text,
  ADD COLUMN last_sync          timestamptz,
  ADD COLUMN home_team_api_id   integer,
  ADD COLUMN away_team_api_id   integer,
  ADD COLUMN scorer_player_ids  integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN scorer_team_ids    integer[] NOT NULL DEFAULT '{}';

ALTER TABLE public.predictions
  ADD COLUMN guess_scorer_player_ids integer[] NOT NULL DEFAULT '{}';

-- ============================================================
-- Migração 3: funções de match + view rankings com fallback por ID
-- ============================================================
CREATE OR REPLACE FUNCTION public.count_scorer_matches(
  real_scorers     text[],
  real_player_ids  integer[],
  guess_scorers    text[],
  guess_player_ids integer[]
) RETURNS integer
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  i int; j int;
  total int := 0;
  guess_len int := COALESCE(array_length(guess_scorers,1),0);
  real_len  int := COALESCE(array_length(real_scorers,1),0);
  used boolean[];
BEGIN
  IF guess_len = 0 OR real_len = 0 THEN RETURN 0; END IF;
  used := array_fill(false, ARRAY[guess_len]);
  FOR i IN 1..real_len LOOP
    FOR j IN 1..guess_len LOOP
      IF used[j] THEN CONTINUE; END IF;
      IF COALESCE(real_player_ids[i],0) <> 0
         AND COALESCE(guess_player_ids[j],0) <> 0 THEN
        IF real_player_ids[i] = guess_player_ids[j] THEN
          used[j] := true; total := total + 1; EXIT;
        END IF;
      ELSE
        IF NULLIF(lower(trim(real_scorers[i])),'') IS NOT NULL
           AND NULLIF(lower(trim(real_scorers[i])),'')
             = NULLIF(lower(trim(guess_scorers[j])),'') THEN
          used[j] := true; total := total + 1; EXIT;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN total;
END $$;

CREATE OR REPLACE FUNCTION public.count_minute_matches(
  real_minutes  integer[],
  guess_minutes integer[]
) RETURNS integer
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  i int; j int;
  total int := 0;
  guess_len int := COALESCE(array_length(guess_minutes,1),0);
  real_len  int := COALESCE(array_length(real_minutes,1),0);
  used boolean[];
BEGIN
  IF guess_len = 0 OR real_len = 0 THEN RETURN 0; END IF;
  used := array_fill(false, ARRAY[guess_len]);
  FOR i IN 1..real_len LOOP
    IF real_minutes[i] IS NULL THEN CONTINUE; END IF;
    FOR j IN 1..guess_len LOOP
      IF used[j] OR guess_minutes[j] IS NULL THEN CONTINUE; END IF;
      IF real_minutes[i] = guess_minutes[j] THEN
        used[j] := true; total := total + 1; EXIT;
      END IF;
    END LOOP;
  END LOOP;
  RETURN total;
END $$;

DROP VIEW IF EXISTS public.rankings;

CREATE VIEW public.rankings
WITH (security_invoker = true) AS
WITH per_pred AS (
  SELECT
    p.user_id,
    CASE WHEN p.guess_home = g.score_home
          AND p.guess_away = g.score_away THEN 1 ELSE 0 END AS p_cnt,
    CASE WHEN (p.guess_home = g.score_home AND p.guess_away = g.score_away) THEN 0
         WHEN sign(p.guess_home - p.guess_away)
              = sign(g.score_home - g.score_away) THEN 1
         ELSE 0 END AS v_cnt,
    public.count_scorer_matches(
      g.scorers, g.scorer_player_ids,
      p.guess_scorers, p.guess_scorer_player_ids
    ) AS a_cnt,
    public.count_minute_matches(g.minutes, p.guess_minutes) AS m_cnt
  FROM public.predictions p
  JOIN public.games g ON g.id = p.game_id
  WHERE g.closed = true
    AND g.score_home IS NOT NULL
    AND g.score_away IS NOT NULL
)
SELECT
  pr.id AS user_id,
  pr.display_name,
  COALESCE(SUM(pp.p_cnt), 0)::int AS p_count,
  COALESCE(SUM(pp.v_cnt), 0)::int AS v_count,
  COALESCE(SUM(pp.a_cnt), 0)::int AS a_count,
  COALESCE(SUM(pp.m_cnt), 0)::int AS m_count,
  (COALESCE(SUM(pp.p_cnt),0)*3
 + COALESCE(SUM(pp.v_cnt),0)*1
 + COALESCE(SUM(pp.a_cnt),0)*1
 + COALESCE(SUM(pp.m_cnt),0)*2)::int AS points
FROM public.profiles pr
LEFT JOIN per_pred pp ON pp.user_id = pr.id
GROUP BY pr.id, pr.display_name;

GRANT SELECT ON public.rankings TO authenticated, anon;
