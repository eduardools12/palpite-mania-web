DROP VIEW IF EXISTS public.rankings;
CREATE VIEW public.rankings
WITH (security_invoker = true) AS
WITH per_pred AS (
  SELECT
    pr.user_id,
    CASE WHEN g.closed AND pr.guess_home = g.score_home AND pr.guess_away = g.score_away
         THEN 1 ELSE 0 END AS p_cnt,
    CASE WHEN g.closed
          AND (pr.guess_home <> g.score_home OR pr.guess_away <> g.score_away)
          AND sign((pr.guess_home - pr.guess_away)::double precision)
            = sign((g.score_home - g.score_away)::double precision)
         THEN 1 ELSE 0 END AS v_cnt,
    CASE WHEN g.closed THEN COALESCE((
      SELECT SUM(gp.cnt)::int
      FROM (
        SELECT lower(btrim(x)) AS name, count(*) AS cnt
        FROM unnest(g.scorers) x
        WHERE x IS NOT NULL AND btrim(x) <> ''
        GROUP BY lower(btrim(x))
      ) gp
      WHERE EXISTS (
        SELECT 1 FROM unnest(pr.guess_scorers) y
        WHERE y IS NOT NULL AND btrim(y) <> '' AND lower(btrim(y)) = gp.name
      )
    ), 0) ELSE 0 END AS a_cnt,
    CASE WHEN g.closed THEN COALESCE((
      SELECT SUM(LEAST(gm.cnt, pm.cnt))::int
      FROM (SELECT m, count(*) cnt FROM unnest(g.minutes) m WHERE m IS NOT NULL GROUP BY m) gm
      JOIN (SELECT m, count(*) cnt FROM unnest(pr.guess_minutes) m WHERE m IS NOT NULL GROUP BY m) pm
        ON pm.m = gm.m
    ), 0) ELSE 0 END AS m_cnt
  FROM predictions pr
  JOIN games g ON g.id = pr.game_id
)
SELECT
  p.id AS user_id,
  p.display_name,
  (COALESCE(SUM(pp.p_cnt), 0) * 3
   + COALESCE(SUM(pp.v_cnt), 0)
   + COALESCE(SUM(pp.a_cnt), 0)
   + COALESCE(SUM(pp.m_cnt), 0) * 2)::int AS points,
  COALESCE(SUM(pp.p_cnt), 0)::int AS p_count,
  COALESCE(SUM(pp.v_cnt), 0)::int AS v_count,
  COALESCE(SUM(pp.a_cnt), 0)::int AS a_count,
  COALESCE(SUM(pp.m_cnt), 0)::int AS m_count
FROM profiles p
LEFT JOIN per_pred pp ON pp.user_id = p.id
GROUP BY p.id, p.display_name;
GRANT SELECT ON public.rankings TO authenticated, anon;