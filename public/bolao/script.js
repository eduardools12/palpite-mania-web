/* ===========================================================
   BOLÃO - Lógica (JavaScript)
   ===========================================================
   Este arquivo contém TODO o COMPORTAMENTO do site.
   Está organizado em blocos comentados:

     1) CONFIGURAÇÃO    -> conecta ao backend (Lovable Cloud)
     2) AUTENTICAÇÃO    -> cadastro, login, logout, sessão
     3) NAVEGAÇÃO       -> trocar entre abas
     4) JOGOS           -> carregar e exibir os jogos abertos
     5) PALPITES        -> enviar/atualizar palpite do jogador
     6) RANKING         -> ler a view de ranking e renderizar
     7) MODERAÇÃO       -> criar jogo e lançar placar final
     8) REALTIME        -> reatualiza tudo quando algo muda no
                           banco (qualquer jogador, qualquer hora)
   =========================================================== */


/* ------------------------------------------------------------
   1) CONFIGURAÇÃO — cliente do banco
   ------------------------------------------------------------ */
const SUPABASE_URL  = "https://xoxpgvgpvqdhoztkxlyj.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhveHBndmdwdnFkaG96dGt4bHlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODI1NTgsImV4cCI6MjA5Njc1ODU1OH0.WG4wuoyax_ZDdTouAbvwLs6-IRtZjDBrwG7hnis-nc8";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// Estado global simples
const state = {
  user: null,        // { id, email }
  profile: null,     // { id, display_name }
  isAdmin: false,
};


/* ------------------------------------------------------------
   2) AUTENTICAÇÃO — cadastro, login, logout
   ------------------------------------------------------------ */
const $ = (sel) => document.querySelector(sel);
const telaLogin = $("#tela-login");
const app       = $("#app");
const authMsg   = $("#auth-msg");

function mostrarMsg(txt, tipo = "erro") {
  authMsg.textContent = txt;
  authMsg.className   = "msg " + tipo;
}

// CADASTRO (cria conta + perfil; trigger no banco cria role)
$("#btn-cadastrar").addEventListener("click", async () => {
  const nome  = $("#auth-nome").value.trim();
  const email = $("#auth-email").value.trim();
  const senha = $("#auth-senha").value;
  if (!nome)  return mostrarMsg("Digite seu nome para se cadastrar.");
  if (!email || senha.length < 6) return mostrarMsg("E-mail válido e senha de 6+ caracteres.");

  mostrarMsg("Criando conta...", "ok");
  const { data, error } = await sb.auth.signUp({
    email, password: senha,
    options: {
      data: { display_name: nome },
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });
  if (error) return mostrarMsg(error.message);
  if (!data.session) return mostrarMsg("Conta criada! Confirme seu e-mail e entre.", "ok");
  mostrarMsg("Conta criada!", "ok");
});

// LOGIN (form submit = botão Entrar)
$("#form-auth").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#auth-email").value.trim();
  const senha = $("#auth-senha").value;
  mostrarMsg("Entrando...", "ok");
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) mostrarMsg(error.message);
});

// LOGOUT
$("#btn-sair").addEventListener("click", async () => {
  await sb.auth.signOut();
});

// Reage a mudanças de sessão (login/logout/refresh)
sb.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) {
    state.user = session.user;
    await carregarPerfilEPapel();
    abrirApp();
  } else {
    state.user = null; state.profile = null; state.isAdmin = false;
    telaLogin.classList.remove("hidden");
    app.classList.add("hidden");
  }
});

async function carregarPerfilEPapel() {
  const { data: perfil } = await sb.from("profiles")
    .select("id, display_name").eq("id", state.user.id).maybeSingle();
  state.profile = perfil;

  const { data: roles } = await sb.from("user_roles")
    .select("role").eq("user_id", state.user.id);
  state.isAdmin = (roles || []).some(r => r.role === "admin");
}

function abrirApp() {
  telaLogin.classList.add("hidden");
  app.classList.remove("hidden");
  $("#user-nome").textContent = "👤 " + (state.profile?.display_name || state.user.email);
  $("#btn-aba-mod").classList.toggle("hidden", !state.isAdmin);

  carregarJogos();
  carregarRanking();
  if (state.isAdmin) carregarJogosParaEncerrar();
  iniciarRealtime();
}


/* ------------------------------------------------------------
   3) NAVEGAÇÃO ENTRE ABAS
   ------------------------------------------------------------ */
document.querySelectorAll(".aba-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".aba-btn").forEach(b => b.classList.remove("ativa"));
    document.querySelectorAll(".aba").forEach(s => s.classList.remove("ativa"));
    btn.classList.add("ativa");
    document.getElementById(btn.dataset.aba).classList.add("ativa");
  });
});


/* ------------------------------------------------------------
   4) JOGOS — carrega jogos abertos e renderiza cards
   ------------------------------------------------------------ */
async function carregarJogos() {
  const lista = $("#lista-jogos");
  lista.innerHTML = "Carregando...";

  const { data: jogos, error } = await sb.from("games")
    .select("*").order("match_at", { ascending: true });
  if (error) { lista.innerHTML = "Erro: " + error.message; return; }

  // Palpites do usuário (para pré-preencher)
  const { data: meusPalpites } = await sb.from("predictions")
    .select("*").eq("user_id", state.user.id);
  const mapPalpites = {};
  (meusPalpites || []).forEach(p => mapPalpites[p.game_id] = p);

  if (!jogos.length) { lista.innerHTML = "<p>Nenhum jogo postado ainda.</p>"; return; }

  lista.innerHTML = "";
  jogos.forEach(j => lista.appendChild(renderCardJogo(j, mapPalpites[j.id])));
}

function renderCardJogo(j, palpite) {
  const div = document.createElement("div");
  div.className = "card-jogo";
  const data = new Date(j.match_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  if (j.closed) {
    div.innerHTML = `
      <h3>${j.team_home} <b>${j.score_home}</b> x <b>${j.score_away}</b> ${j.team_away}</h3>
      <div class="data">${data} • Encerrado</div>
      ${j.scorer ? `<div class="status-final">Goleador: ${j.scorer}</div>` : ""}
      ${palpite ? `<div class="status-final" style="color:#60a5fa">
        Seu palpite: ${palpite.guess_home} x ${palpite.guess_away}
        ${palpite.guess_scorer ? ` • ${palpite.guess_scorer}` : ""}
      </div>` : ""}
    `;
    return div;
  }

  div.innerHTML = `
    <h3>${j.team_home} x ${j.team_away}</h3>
    <div class="data">${data}</div>
    <div class="placar-input">
      <input type="number" min="0" id="gh-${j.id}" value="${palpite?.guess_home ?? ""}" placeholder="0" />
      <span>x</span>
      <input type="number" min="0" id="ga-${j.id}" value="${palpite?.guess_away ?? ""}" placeholder="0" />
    </div>
    <input type="text" id="gs-${j.id}" value="${palpite?.guess_scorer ?? ""}" placeholder="Quem fez o gol? (opcional)" />
    <button data-jogo="${j.id}">${palpite ? "Atualizar palpite" : "Enviar palpite"}</button>
  `;
  div.querySelector("button").addEventListener("click", () => enviarPalpite(j.id));
  return div;
}


/* ------------------------------------------------------------
   5) PALPITES — upsert (cria ou atualiza) na tabela predictions
   ------------------------------------------------------------ */
async function enviarPalpite(gameId) {
  const gh = parseInt($("#gh-" + gameId).value, 10);
  const ga = parseInt($("#ga-" + gameId).value, 10);
  const gs = $("#gs-" + gameId).value.trim() || null;
  if (Number.isNaN(gh) || Number.isNaN(ga)) return alert("Preencha os dois placares.");

  const { error } = await sb.from("predictions").upsert({
    game_id: gameId, user_id: state.user.id,
    guess_home: gh, guess_away: ga, guess_scorer: gs,
  }, { onConflict: "game_id,user_id" });

  if (error) alert("Erro: " + error.message);
  else carregarJogos();
}


/* ------------------------------------------------------------
   6) RANKING — lê a view "rankings" (calculada no banco)
   ------------------------------------------------------------ */
async function carregarRanking() {
  const corpo = $("#corpo-ranking");
  const { data, error } = await sb.from("rankings")
    .select("*").order("points", { ascending: false });
  if (error) { corpo.innerHTML = `<tr><td colspan="3">Erro: ${error.message}</td></tr>`; return; }
  if (!data.length) { corpo.innerHTML = `<tr><td colspan="3">Sem jogadores ainda.</td></tr>`; return; }

  corpo.innerHTML = data.map((r, i) =>
    `<tr><td>${i + 1}</td><td>${r.display_name}</td><td>${r.points}</td></tr>`
  ).join("");
}


/* ------------------------------------------------------------
   7) MODERAÇÃO — só admin
   ------------------------------------------------------------ */
// Criar novo jogo
$("#form-novo-jogo").addEventListener("submit", async (e) => {
  e.preventDefault();
  const team_home = $("#time-casa").value.trim();
  const team_away = $("#time-fora").value.trim();
  const match_at  = new Date($("#data-jogo").value).toISOString();

  const { error } = await sb.from("games").insert({ team_home, team_away, match_at });
  if (error) return alert("Erro: " + error.message);

  e.target.reset();
  carregarJogos();
  carregarJogosParaEncerrar();
});

// Lista jogos abertos com formulário p/ lançar placar
async function carregarJogosParaEncerrar() {
  const div = $("#lista-encerrar");
  const { data: jogos } = await sb.from("games")
    .select("*").eq("closed", false).order("match_at");
  if (!jogos?.length) { div.innerHTML = "<p>Nenhum jogo aberto.</p>"; return; }

  div.innerHTML = "";
  jogos.forEach(j => {
    const linha = document.createElement("div");
    linha.className = "linha-encerrar";
    linha.innerHTML = `
      <span><b>${j.team_home}</b> x <b>${j.team_away}</b></span>
      <input type="number" min="0" placeholder="Casa"   id="sh-${j.id}" />
      <input type="number" min="0" placeholder="Fora"   id="sa-${j.id}" />
      <input type="text"           placeholder="Goleador" id="sc-${j.id}" />
      <button data-jogo="${j.id}">Encerrar</button>
    `;
    linha.querySelector("button").addEventListener("click", () => encerrarJogo(j.id));
    div.appendChild(linha);
  });
}

async function encerrarJogo(gameId) {
  const sh = parseInt($("#sh-" + gameId).value, 10);
  const sa = parseInt($("#sa-" + gameId).value, 10);
  const sc = $("#sc-" + gameId).value.trim() || null;
  if (Number.isNaN(sh) || Number.isNaN(sa)) return alert("Preencha o placar.");

  const { error } = await sb.from("games").update({
    score_home: sh, score_away: sa, scorer: sc, closed: true,
  }).eq("id", gameId);
  if (error) return alert("Erro: " + error.message);

  carregarJogos();
  carregarJogosParaEncerrar();
  carregarRanking();
}


/* ------------------------------------------------------------
   8) REALTIME — escuta mudanças no banco e reatualiza a tela
   ------------------------------------------------------------ */
let canal = null;
function iniciarRealtime() {
  if (canal) return;
  canal = sb.channel("bolao-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "games" }, () => {
      carregarJogos();
      carregarRanking();
      if (state.isAdmin) carregarJogosParaEncerrar();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "predictions" }, () => {
      carregarRanking();
    })
    .subscribe();
}