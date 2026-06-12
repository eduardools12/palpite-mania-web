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
const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));
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
// IMPORTANTE: não usar await direto dentro do callback (causa deadlock no
// supabase-js e o login fica preso em "Entrando..."). Defer com setTimeout.
sb.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    state.user = session.user;
    setTimeout(async () => {
      await carregarPerfilEPapel();
      abrirApp();
    }, 0);
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
  $("#user-nome").textContent = state.profile?.display_name || state.user.email;
  $("#btn-aba-mod").classList.toggle("hidden", !state.isAdmin);

  carregarJogos();
  carregarRanking();
  carregarEspeciais();
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
    const scorers = j.scorers || [];
    const minutes = j.minutes || [];
    const gols = scorers.map((s, i) => {
      const m = minutes[i];
      const nome = (s && s.trim()) ? s : "(sem jogador)";
      const min  = (m !== null && m !== undefined && m !== "") ? `${m}'` : "";
      return `${escapeHtml(nome)}${min ? " " + escapeHtml(min) : ""}`;
    }).join(" • ");

    const pScorers = (palpite?.guess_scorers) || [];
    const pMinutes = (palpite?.guess_minutes) || [];
    const meusGols = pScorers.map((s, i) => {
      const m = pMinutes[i];
      const nome = (s && s.trim()) ? s : "?";
      const min  = (m !== null && m !== undefined && m !== "") ? ` ${m}'` : "";
      return `${escapeHtml(nome)}${escapeHtml(min)}`;
    }).join(" • ");

    div.innerHTML = `
      <h3>${escapeHtml(j.team_home)} <b>${escapeHtml(j.score_home)}</b> x <b>${escapeHtml(j.score_away)}</b> ${escapeHtml(j.team_away)}</h3>
      <div class="data">${data} • Encerrado</div>
      ${gols ? `<div class="status-final">Gols: ${gols}</div>` : ""}
      ${palpite ? `<div class="status-final" style="color:#60a5fa">
        Seu palpite: ${escapeHtml(palpite.guess_home)} x ${escapeHtml(palpite.guess_away)}
        ${meusGols ? ` • ${meusGols}` : ""}
      </div>` : ""}
    `;
    return div;
  }

  // Jogo ainda aberto. Verifica se está dentro do prazo (até 1 min antes).
  const inicioMs   = new Date(j.match_at).getTime();
  const travadoEm  = inicioMs - 60_000;
  const travado    = Date.now() >= travadoEm;

  div.innerHTML = `
    <h3>${escapeHtml(j.team_home)} x ${escapeHtml(j.team_away)}</h3>
    <div class="data">${data}${travado ? " • Palpites travados" : ""}</div>
    <div class="placar-input">
      <input type="number" min="0" id="gh-${j.id}" value="${palpite?.guess_home ?? ""}" placeholder="0" ${travado ? "disabled" : ""} />
      <span>x</span>
      <input type="number" min="0" id="ga-${j.id}" value="${palpite?.guess_away ?? ""}" placeholder="0" ${travado ? "disabled" : ""} />
    </div>
    <div class="slots-gols" id="slots-${j.id}"></div>
    ${travado
      ? `<p class="msg">Os palpites para este jogo já estão travados (1 min antes do início).</p>`
      : `<button data-jogo="${j.id}">${palpite ? "Atualizar palpite" : "Enviar palpite"}</button>`}
  `;

  const ghEl    = div.querySelector(`#gh-${j.id}`);
  const gaEl    = div.querySelector(`#ga-${j.id}`);
  const slotsEl = div.querySelector(`#slots-${j.id}`);

  const renderSlots = () => {
    const gh = parseInt(ghEl.value, 10);
    const ga = parseInt(gaEl.value, 10);
    const total = (Number.isNaN(gh) ? 0 : gh) + (Number.isNaN(ga) ? 0 : ga);
    const prevScorers = palpite?.guess_scorers || [];
    const prevMinutes = palpite?.guess_minutes || [];
    if (total <= 0) { slotsEl.innerHTML = ""; return; }
    let html = `<p class="dica">Para cada gol, opcionalmente diga quem fez (+1 pt) e em que minuto (+2 pts).</p>`;
    for (let i = 0; i < total; i++) {
      const s = prevScorers[i] ?? "";
      const m = prevMinutes[i] ?? "";
      html += `
        <div class="linha-gol">
          <span>Gol ${i + 1}</span>
          <input type="text"   data-tipo="scorer" data-i="${i}" value="${s}" placeholder="Jogador (opcional)" ${travado ? "disabled" : ""} />
          <input type="number" data-tipo="minute" data-i="${i}" min="0" max="200" value="${m}" placeholder="Min" ${travado ? "disabled" : ""} />
        </div>`;
    }
    slotsEl.innerHTML = html;
  };
  renderSlots();
  if (!travado) {
    ghEl.addEventListener("input", renderSlots);
    gaEl.addEventListener("input", renderSlots);
    div.querySelector("button")?.addEventListener("click", () => enviarPalpite(j.id, slotsEl));
  }
  return div;
}


/* ------------------------------------------------------------
   5) PALPITES — upsert (cria ou atualiza) na tabela predictions
   ------------------------------------------------------------ */
async function enviarPalpite(gameId, slotsEl) {
  const gh = parseInt($("#gh-" + gameId).value, 10);
  const ga = parseInt($("#ga-" + gameId).value, 10);
  if (Number.isNaN(gh) || Number.isNaN(ga)) return alert("Preencha os dois placares.");

  const total = gh + ga;
  const guess_scorers = [];
  const guess_minutes = [];
  for (let i = 0; i < total; i++) {
    const sEl = slotsEl.querySelector(`input[data-tipo="scorer"][data-i="${i}"]`);
    const mEl = slotsEl.querySelector(`input[data-tipo="minute"][data-i="${i}"]`);
    guess_scorers.push((sEl?.value || "").trim());
    const mv = mEl?.value;
    guess_minutes.push(mv === "" || mv === undefined || mv === null ? null : parseInt(mv, 10));
  }

  const { error } = await sb.from("predictions").upsert({
    game_id: gameId, user_id: state.user.id,
    guess_home: gh, guess_away: ga,
    guess_scorers, guess_minutes,
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

  corpo.innerHTML = "";
  data.forEach((r, i) => {
    const tr = document.createElement("tr");
    [String(i + 1), r.display_name ?? "", String(r.points ?? 0)].forEach(v => {
      const td = document.createElement("td");
      td.textContent = v;
      tr.appendChild(td);
    });
    corpo.appendChild(tr);
  });
}


/* ------------------------------------------------------------
   7) MODERAÇÃO — só admin
   ------------------------------------------------------------ */

/* ------------------------------------------------------------
   ESPECIAIS — palpites de temporada
   ------------------------------------------------------------ */
async function carregarEspeciais() {
  const { data } = await sb.from("season_predictions")
    .select("*").eq("user_id", state.user.id).maybeSingle();
  if (!data) return;
  $("#esp-artilheiro").value      = data.artilheiro      ?? "";
  $("#esp-campeao").value         = data.campeao         ?? "";
  $("#esp-time-revelacao").value  = data.time_revelacao  ?? "";
  $("#esp-selecao-carisma").value = data.selecao_carisma ?? "";
}

$("#form-especiais").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#esp-msg");
  msg.className = "msg ok"; msg.textContent = "Salvando...";
  const payload = {
    user_id: state.user.id,
    artilheiro:      $("#esp-artilheiro").value.trim()      || null,
    campeao:         $("#esp-campeao").value.trim()         || null,
    time_revelacao:  $("#esp-time-revelacao").value.trim()  || null,
    selecao_carisma: $("#esp-selecao-carisma").value.trim() || null,
  };
  const { error } = await sb.from("season_predictions")
    .upsert(payload, { onConflict: "user_id" });
  if (error) { msg.className = "msg erro"; msg.textContent = "Erro: " + error.message; }
  else       { msg.className = "msg ok";   msg.textContent = "Palpites salvos!"; }
});

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
      <div class="linha-encerrar-topo">
        <span><b>${escapeHtml(j.team_home)}</b> x <b>${escapeHtml(j.team_away)}</b></span>
        <input type="number" min="0" placeholder="Casa" id="sh-${j.id}" />
        <input type="number" min="0" placeholder="Fora" id="sa-${j.id}" />
        <button data-jogo="${j.id}">Encerrar</button>
      </div>
      <div class="slots-gols" id="slots-mod-${j.id}"></div>
    `;
    const shEl = linha.querySelector(`#sh-${j.id}`);
    const saEl = linha.querySelector(`#sa-${j.id}`);
    const slotsEl = linha.querySelector(`#slots-mod-${j.id}`);
    const renderModSlots = () => {
      const sh = parseInt(shEl.value, 10);
      const sa = parseInt(saEl.value, 10);
      const total = (Number.isNaN(sh) ? 0 : sh) + (Number.isNaN(sa) ? 0 : sa);
      if (total <= 0) { slotsEl.innerHTML = ""; return; }
      let html = "";
      for (let i = 0; i < total; i++) {
        html += `
          <div class="linha-gol">
            <span>Gol ${i + 1}</span>
            <input type="text"   data-tipo="scorer" data-i="${i}" placeholder="Jogador (opcional)" />
            <input type="number" data-tipo="minute" data-i="${i}" min="0" max="200" placeholder="Min" />
          </div>`;
      }
      slotsEl.innerHTML = html;
    };
    shEl.addEventListener("input", renderModSlots);
    saEl.addEventListener("input", renderModSlots);
    linha.querySelector("button").addEventListener("click", () => encerrarJogo(j.id, slotsEl));
    div.appendChild(linha);
  });
}

async function encerrarJogo(gameId, slotsEl) {
  const sh = parseInt($("#sh-" + gameId).value, 10);
  const sa = parseInt($("#sa-" + gameId).value, 10);
  if (Number.isNaN(sh) || Number.isNaN(sa)) return alert("Preencha o placar.");

  const total = sh + sa;
  const scorers = [];
  const minutes = [];
  for (let i = 0; i < total; i++) {
    const sEl = slotsEl.querySelector(`input[data-tipo="scorer"][data-i="${i}"]`);
    const mEl = slotsEl.querySelector(`input[data-tipo="minute"][data-i="${i}"]`);
    scorers.push((sEl?.value || "").trim());
    const mv = mEl?.value;
    minutes.push(mv === "" || mv === undefined || mv === null ? null : parseInt(mv, 10));
  }

  const { error } = await sb.from("games").update({
    score_home: sh, score_away: sa, scorers, minutes, closed: true,
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
  // Só escutamos mudanças em "games" (jogo novo ou placar lançado).
  // Palpites NÃO são publicados em tempo real para não vazar palpites
  // de outros jogadores enquanto o jogo está aberto.
  canal = sb.channel("bolao-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "games" }, () => {
      carregarJogos();
      carregarRanking();
      if (state.isAdmin) carregarJogosParaEncerrar();
    })
    .subscribe();
}