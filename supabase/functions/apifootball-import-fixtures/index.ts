// Importa/atualiza fixtures da Copa do Mundo 2026 (league=1, season=2026)
// e faz upsert na tabela public.games (sem sobrescrever placar/scorers já lançados).
// Requer admin (verifica via has_role com o JWT do chamador).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LEAGUE = 1;
const SEASON = 2026;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const key = Deno.env.get("API_FOOTBALL_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PUB_KEY      = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    if (!key) throw new Error("API_FOOTBALL_KEY ausente");

    // 1) Autorização: precisa ser admin
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ ok: false, error: "Não autenticado" }, 401);
    const userClient = createClient(SUPABASE_URL, PUB_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return json({ ok: false, error: "Usuário inválido" }, 401);
    const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (!isAdmin) return json({ ok: false, error: "Apenas admin" }, 403);

    // 2) Busca fixtures
    const apiR = await fetch(
      `https://v3.football.api-sports.io/fixtures?league=${LEAGUE}&season=${SEASON}`,
      { headers: { "x-apisports-key": key } },
    );
    const apiJson = await apiR.json();
    const fixtures: any[] = apiJson?.response ?? [];

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    let inserted = 0, updated = 0, skipped = 0;

    for (const fx of fixtures) {
      const fixtureId  = fx?.fixture?.id;
      if (!fixtureId) { skipped++; continue; }
      const matchAt    = fx?.fixture?.date;
      const status     = fx?.fixture?.status?.short ?? null;
      const round      = fx?.league?.round ?? null;
      const homeName   = fx?.teams?.home?.name ?? "?";
      const awayName   = fx?.teams?.away?.name ?? "?";
      const homeApiId  = fx?.teams?.home?.id ?? null;
      const awayApiId  = fx?.teams?.away?.id ?? null;

      // já existe?
      const { data: existing } = await admin
        .from("games")
        .select("id, closed")
        .eq("api_fixture_id", fixtureId)
        .maybeSingle();

      const baseFields = {
        api_fixture_id: fixtureId,
        api_league_id: LEAGUE,
        api_season: SEASON,
        round,
        status,
        team_home: homeName,
        team_away: awayName,
        home_team_api_id: homeApiId,
        away_team_api_id: awayApiId,
        match_at: matchAt,
        last_sync: new Date().toISOString(),
      };

      if (!existing) {
        const { error } = await admin.from("games").insert(baseFields);
        if (!error) inserted++;
      } else {
        // se já encerrado manualmente, só atualiza metadados (não toca placar)
        const { error } = await admin
          .from("games")
          .update(baseFields)
          .eq("id", existing.id);
        if (!error) updated++;
      }
    }

    return json({ ok: true, total: fixtures.length, inserted, updated, skipped });
  } catch (e) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}