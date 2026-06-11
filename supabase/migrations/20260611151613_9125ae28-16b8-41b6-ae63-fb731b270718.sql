
-- 1) Add arrays for multiple scorers and minutes on games and predictions
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS scorers text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS minutes integer[] NOT NULL DEFAULT '{}';

ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS guess_scorers text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS guess_minutes integer[] NOT NULL DEFAULT '{}';

-- 2) Update RLS on predictions: only allow insert/update/delete until 1 minute before match
DROP POLICY IF EXISTS "Insert own predictions on open games" ON public.predictions;
DROP POLICY IF EXISTS "Update own predictions on open games" ON public.predictions;
DROP POLICY IF EXISTS "Delete own predictions on open games" ON public.predictions;

CREATE POLICY "Insert own predictions before lock"
  ON public.predictions FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = predictions.game_id
        AND NOT g.closed
        AND g.match_at > now() + interval '1 minute'
    )
  );

CREATE POLICY "Update own predictions before lock"
  ON public.predictions FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = predictions.game_id
        AND NOT g.closed
        AND g.match_at > now() + interval '1 minute'
    )
  );

CREATE POLICY "Delete own predictions before lock"
  ON public.predictions FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = predictions.game_id
        AND NOT g.closed
        AND g.match_at > now() + interval '1 minute'
    )
  );

-- 3) Rebuild ranking view with new scoring:
--    - Placar exato: 3 pts
--    - Acertou o vencedor (sem placar exato): 1 pt
--    - Cada jogador acertado (multiset, case-insensitive): 1 pt
--    - Cada minutagem acertada (multiset): 2 pts
CREATE OR REPLACE VIEW public.rankings AS
WITH per_pred AS (
  SELECT
    pr.user_id,
    CASE WHEN g.closed THEN
      (CASE WHEN pr.guess_home = g.score_home AND pr.guess_away = g.score_away THEN 3 ELSE 0 END)
      + (CASE WHEN (pr.guess_home <> g.score_home OR pr.guess_away <> g.score_away)
              AND sign((pr.guess_home - pr.guess_away)::float) = sign((g.score_home - g.score_away)::float)
              THEN 1 ELSE 0 END)
      + COALESCE((
          SELECT SUM(LEAST(gp.cnt, pp.cnt))::int
          FROM (
            SELECT lower(trim(x)) AS name, count(*) AS cnt
            FROM unnest(g.scorers) AS x
            WHERE x IS NOT NULL AND trim(x) <> ''
            GROUP BY lower(trim(x))
          ) gp
          JOIN (
            SELECT lower(trim(x)) AS name, count(*) AS cnt
            FROM unnest(pr.guess_scorers) AS x
            WHERE x IS NOT NULL AND trim(x) <> ''
            GROUP BY lower(trim(x))
          ) pp ON pp.name = gp.name
        ), 0)
      + COALESCE((
          SELECT SUM(LEAST(gm.cnt, pm.cnt))::int * 2
          FROM (
            SELECT m, count(*) AS cnt FROM unnest(g.minutes) AS m WHERE m IS NOT NULL GROUP BY m
          ) gm
          JOIN (
            SELECT m, count(*) AS cnt FROM unnest(pr.guess_minutes) AS m WHERE m IS NOT NULL GROUP BY m
          ) pm ON pm.m = gm.m
        ), 0)
    ELSE 0 END AS pts
  FROM public.predictions pr
  JOIN public.games g ON g.id = pr.game_id
)
SELECT p.id AS user_id,
       p.display_name,
       COALESCE(SUM(pp.pts), 0)::int AS points
FROM public.profiles p
LEFT JOIN per_pred pp ON pp.user_id = p.id
GROUP BY p.id, p.display_name;
