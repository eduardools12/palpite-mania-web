// Verifica conexão com a API-Football e devolve status da chave + uso atual.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const key = Deno.env.get("API_FOOTBALL_KEY");
    if (!key) {
      return new Response(JSON.stringify({ ok: false, error: "API_FOOTBALL_KEY ausente" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const r = await fetch("https://v3.football.api-sports.io/status", {
      headers: { "x-apisports-key": key },
    });
    const data = await r.json();
    return new Response(JSON.stringify({ ok: true, status: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});