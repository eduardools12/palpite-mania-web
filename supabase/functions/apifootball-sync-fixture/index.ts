// Sincroniza um jogo: busca placar + eventos de gol da API-Football e
// atualiza public.games (score, scorers/minutes/player_ids/team_ids, status, closed).
// Também faz upsert dos jogadores que marcaram em public.players.
// Requer admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const key = Deno.env.get("API_FOOTBALL_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PUB_KEY      = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    if (!key) throw new Error("API_FOOTBALL_KEY ausente");

    const body = await req.json().catch(() => ({}));
    const gameId: string | undefined = body?.game_id;
    const fixtureIdIn: number | undefined = body?.api_fixture_id;
    const closeIfFinished: boolean = body?.close_if_finished ?? true;
    if (!gameId && !fixtureIdIn) return json({ ok: false, error: "Informe game_id ou api_fixture_id" }, 400);

    // Autorização: admin
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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Carrega o jogo
    let game: any = null;
    if (gameId) {
      const { data } = await admin.from("games").select("*").eq("id", gameId).maybeSingle();
      game = data;
    } else {
      const { data } = await admin.from("games").select("*").eq("api_fixture_id", fixtureIdIn).maybeSingle();
      game = data;
    }
    if (!game) return json({ ok: false, error: "Jogo não encontrado" }, 404);
    const fixtureId = game.api_fixture_id ?? fixtureIdIn;
    if (!fixtureId) return json({ ok: false, error: "Jogo sem api_fixture_id" }, 400);

    // Busca fixture + eventos
    const [fxR, evR] = await Promise.all([
      fetch(`https://v3.football.api-sports.io/fixtures?id=${fixtureId}`, { headers: { "x-apisports-key": key } }),
      fetch(`https://v3.football.api-sports.io/fixtures/events?fixture=${fixtureId}`, { headers: { "x-apisports-key": key } }),
    ]);
    const fxJson = await fxR.json();
    const evJson = await evR.json();
    const fx = fxJson?.response?.[0];
    if (!fx) return json({ ok: false, error: "Fixture não retornada pela API" }, 502);

    const status = fx?.fixture?.status?.short ?? null;
    const finished = ["FT", "AET", "PEN"].includes(status);
    const scoreHome = fx?.goals?.home ?? null;
    const scoreAway = fx?.goals?.away ?? null;

    // Filtra eventos de gol (exclui gols anulados via VAR/Missed Penalty)
    const goalEvents: any[] = (evJson?.response ?? []).filter((e: any) =>
      e?.type === "Goal" && e?.detail !== "Missed Penalty",
    );

    const scorers: string[] = [];
    const minutes: number[] = [];
    const scorer_player_ids: number[] = [];
    const scorer_team_ids:   number[] = [];

    const playersToUpsert = new Map<number, any>();
    for (const ev of goalEvents) {
      const pid  = ev?.player?.id ?? 0;
      const pname = ev?.player?.name ?? "";
      const tid  = ev?.team?.id ?? 0;
      const tname = ev?.team?.name ?? "";
      const minute = (ev?.time?.elapsed ?? 0) + (ev?.time?.extra ?? 0);
      scorers.push(pname);
      minutes.push(minute);
      scorer_player_ids.push(pid || 0);
      scorer_team_ids.push(tid || 0);
      if (pid && pname && !playersToUpsert.has(pid)) {
        playersToUpsert.set(pid, { api_player_id: pid, name: pname, team_id: tid || null, team_name: tname || null });
      }
    }

    // Upsert players catalog
    if (playersToUpsert.size > 0) {
      await admin.from("players").upsert(Array.from(playersToUpsert.values()), { onConflict: "api_player_id" });
    }

    const update: any = {
      status,
      score_home: scoreHome,
      score_away: scoreAway,
      scorers,
      minutes,
      scorer_player_ids,
      scorer_team_ids,
      last_sync: new Date().toISOString(),
    };
    if (closeIfFinished && finished) update.closed = true;

    const { error: updErr } = await admin.from("games").update(update).eq("id", game.id);
    if (updErr) throw updErr;

    return json({
      ok: true,
      game_id: game.id,
      api_fixture_id: fixtureId,
      status, finished,
      score: { home: scoreHome, away: scoreAway },
      goals: scorers.length,
      players_upserted: playersToUpsert.size,
      closed: !!update.closed,
    });
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