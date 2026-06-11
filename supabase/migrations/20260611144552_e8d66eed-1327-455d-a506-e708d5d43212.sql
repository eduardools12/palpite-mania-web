
DROP VIEW IF EXISTS public.rankings;
CREATE VIEW public.rankings WITH (security_invoker = true) AS
SELECT
  p.id AS user_id,
  p.display_name,
  COALESCE(SUM(
    CASE WHEN g.closed THEN
      (CASE WHEN pr.guess_home = g.score_home AND pr.guess_away = g.score_away THEN 3 ELSE 0 END) +
      (CASE WHEN (pr.guess_home <> g.score_home OR pr.guess_away <> g.score_away)
              AND sign(pr.guess_home - pr.guess_away) = sign(g.score_home - g.score_away) THEN 1 ELSE 0 END) +
      (CASE WHEN pr.guess_scorer IS NOT NULL AND g.scorer IS NOT NULL
                 AND lower(trim(pr.guess_scorer)) = lower(trim(g.scorer)) THEN 1 ELSE 0 END)
    ELSE 0 END
  ), 0)::int AS points
FROM public.profiles p
LEFT JOIN public.predictions pr ON pr.user_id = p.id
LEFT JOIN public.games g ON g.id = pr.game_id
GROUP BY p.id, p.display_name;
GRANT SELECT ON public.rankings TO authenticated, anon;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
