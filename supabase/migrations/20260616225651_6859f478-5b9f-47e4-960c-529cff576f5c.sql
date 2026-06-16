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
          SELECT SUM(gp.cnt)::int
          FROM (
            SELECT lower(trim(x)) AS name, count(*) AS cnt
            FROM unnest(g.scorers) AS x
            WHERE x IS NOT NULL AND trim(x) <> ''
            GROUP BY lower(trim(x))
          ) gp
          WHERE EXISTS (
            SELECT 1 FROM unnest(pr.guess_scorers) AS y
            WHERE y IS NOT NULL AND trim(y) <> ''
              AND lower(trim(y)) = gp.name
          )
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