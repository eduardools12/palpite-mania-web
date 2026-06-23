// Busca jogadores na API-Football (league=1, season=2026) por nome, faz upsert em
// public.players e devolve a lista para o combobox de palpites.
// Acessível a qualquer usuário autenticado.
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

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length < 3) return json({ ok: true, players: [], note: "Digite ao menos 3 letras" });

    // Autenticação (qualquer usuário logado)
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ ok: false, error: "Não autenticado" }, 401);
    const userClient = createClient(SUPABASE_URL, PUB_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user?.id) return json({ ok: false, error: "Usuário inválido" }, 401);

    // 1) Busca local primeiro (cache)
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: local } = await admin
      .from("players")
      .select("api_player_id, name, team_name, position, photo")
      .ilike("name", `%${q}%`)
      .limit(20);

    // 2) Busca na API-Football
    const apiR = await fetch(
      `https://v3.football.api-sports.io/players?search=${encodeURIComponent(q)}&league=${LEAGUE}&season=${SEASON}`,
      { headers: { "x-apisports-key": key } },
    );
    const apiJson = await apiR.json();
    const apiList: any[] = apiJson?.response ?? [];

    const toUpsert = apiList.map((row) => {
      const p = row?.player ?? {};
      const stats = row?.statistics?.[0] ?? {};
      return {
        api_player_id: p.id,
        name: p.name,
        photo: p.photo ?? null,
        position: stats?.games?.position ?? null,
        team_id: stats?.team?.id ?? null,
        team_name: stats?.team?.name ?? null,
        nationality: p.nationality ?? null,
        age: p.age ?? null,
        height: p.height ?? null,
        weight: p.weight ?? null,
      };
    }).filter((p) => p.api_player_id && p.name);

    if (toUpsert.length > 0) {
      await admin.from("players").upsert(toUpsert, { onConflict: "api_player_id" });
    }

    // Merge: API + local, deduplicado por api_player_id
    const map = new Map<number, any>();
    for (const p of local ?? []) map.set(p.api_player_id, p);
    for (const p of toUpsert) {
      map.set(p.api_player_id, {
        api_player_id: p.api_player_id, name: p.name,
        team_name: p.team_name, position: p.position, photo: p.photo,
      });
    }
    const players = Array.from(map.values()).slice(0, 30);
    return json({ ok: true, players });
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