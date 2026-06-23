//1) CONFIGURAÇÃO — cliente do banco
const SUPABASE_URL  = "https://rarmvpbvcptrhlhvlaye.supabase.co";
const SUPABASE_ANON = "sb_publishable_eanYKgVZFnH80oHxjcUmtA_ZMvO6IGn";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// Estado global simples
const state = {
  user: null,        // { id, email }
  profile: null,     // { id, display_name }
  isAdmin: false,
};


//2) AUTENTICAÇÃO — cadastro, login, logout
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
  carregarEstatisticas();
  if (state.isAdmin) carregarJogosParaEncerrar();
  iniciarRealtime();
}


//3) NAVEGAÇÃO ENTRE ABAS
document.querySelectorAll(".aba-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".aba-btn").forEach(b => b.classList.remove("ativa"));
    document.querySelectorAll(".aba").forEach(s => s.classList.remove("ativa"));
    btn.classList.add("ativa");
    document.getElementById(btn.dataset.aba).classList.add("ativa");
    if (btn.dataset.aba === "tab-estatisticas") carregarEstatisticas();
  });
});


//4) JOGOS — carrega jogos abertos e renderiza cards

async function carregarJogos() {
  const abertos = $("#lista-jogos-abertos");
  const encerrados = $("#lista-jogos-encerrados");
  abertos.innerHTML = "Carregando...";
  encerrados.innerHTML = "";

  const { data: jogos, error } = await sb.from("games")
    .select("*").order("match_at", { ascending: true });
  if (error) { abertos.innerHTML = "Erro: " + error.message; return; }

  // Palpites do usuário (para pré-preencher)
  const { data: meusPalpites } = await sb.from("predictions")
    .select("*").eq("user_id", state.user.id);
  const mapPalpites = {};
  (meusPalpites || []).forEach(p => mapPalpites[p.game_id] = p);

  const listaAbertos = jogos.filter(j => !j.closed);
  const listaEncerrados = jogos.filter(j => j.closed)
    .sort((a, b) => new Date(b.match_at) - new Date(a.match_at));

  abertos.innerHTML = "";
  if (!listaAbertos.length) abertos.innerHTML = "<p>Nenhum jogo aberto no momento.</p>";
  else listaAbertos.forEach(j => abertos.appendChild(renderCardJogo(j, mapPalpites[j.id])));

  encerrados.innerHTML = "";
  if (!listaEncerrados.length) encerrados.innerHTML = "<p>Nenhum jogo encerrado ainda.</p>";
  else listaEncerrados.forEach(j => encerrados.appendChild(renderCardJogo(j, mapPalpites[j.id])));
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


//5) PALPITES — upsert (cria ou atualiza) na tabela predictions
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


//6) RANKING — lê a view "rankings" (calculada no banco)
async function carregarRanking() {
  const corpo = $("#corpo-ranking");
  const { data, error } = await sb.from("rankings")
    .select("*").order("points", { ascending: false });
  if (error) { corpo.innerHTML = `<tr><td colspan="7">Erro: ${error.message}</td></tr>`; return; }
  if (!data.length) { corpo.innerHTML = `<tr><td colspan="7">Sem jogadores ainda.</td></tr>`; return; }

  corpo.innerHTML = "";
  data.forEach((r, i) => {
    const tr = document.createElement("tr");
    const cels = [
      String(i + 1),
      r.display_name ?? "",
      String(r.p_count ?? 0),
      String(r.v_count ?? 0),
      String(r.a_count ?? 0),
      String(r.m_count ?? 0),
      String(r.points ?? 0),
    ];
    const titles = [
      "",
      "",
      "Placar exato: 3 pontos quando o palpite acerta o placar final exato (gols do time da casa e do visitante).",
      "Vencedor: 1 ponto quando o palpite acerta quem venceu ou o empate, sem acertar o placar exato.",
      "Artilheiros: 1 ponto para cada gol real em que o palpite acertou o jogador que marcou. Se um jogador marcou mais de um gol e foi indicado uma vez, cada gol conta.",
      "Minutos: 2 pontos para cada gol real em que o palpite acertou o minuto exato. O minuto precisa coincidir com um gol real do jogo.",
      "Total de pontos = (P × 3) + (V × 1) + (A × 1) + (M × 2).",
    ];
    cels.forEach((v, idx) => {
      const td = document.createElement("td");
      td.textContent = v;
      if (titles[idx]) td.title = titles[idx];
      tr.appendChild(td);
    });
    corpo.appendChild(tr);
  });
}


//7) MODERAÇÃO — só admin

//ESPECIAIS — palpites de temporada
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


//
   8) REALTIME — escuta mudanças no banco e reatualiza a tela
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

//9) ESTATÍSTICAS — calcula resumo por jogador a partir dos
      jogos encerrados e das predictions (todos podem ver).
function calcPontosPorPredicao(g, p) {
  let pts = 0, pCnt = 0, vCnt = 0, aCnt = 0, mCnt = 0;
  if (p.guess_home === g.score_home && p.guess_away === g.score_away) {
    pts += 3; pCnt = 1;
  } else {
    const realW = Math.sign(g.score_home - g.score_away);
    const palpW = Math.sign(p.guess_home - p.guess_away);
    if (realW === palpW) { pts += 1; vCnt = 1; }
  }
  const realScorers = (g.scorers || []).map(s => (s || "").trim().toLowerCase());
  const realMinutes = (g.minutes || []);
  const guessScorers = (p.guess_scorers || []).map(s => (s || "").trim().toLowerCase());
  const guessMinutes = (p.guess_minutes || []);
  const usadosA = new Array(realScorers.length).fill(false);
  guessScorers.forEach(gs => {
    if (!gs) return;
    const idx = realScorers.findIndex((rs, i) => !usadosA[i] && rs && rs === gs);
    if (idx >= 0) { usadosA[idx] = true; aCnt += 1; pts += 1; }
  });
  const usadosM = new Array(realMinutes.length).fill(false);
  guessMinutes.forEach(gm => {
    if (gm === null || gm === undefined || gm === "") return;
    const gmN = parseInt(gm, 10);
    const idx = realMinutes.findIndex((rm, i) => !usadosM[i] && rm !== null && rm !== undefined && parseInt(rm, 10) === gmN);
    if (idx >= 0) { usadosM[idx] = true; mCnt += 1; pts += 2; }
  });
  return { pts, pCnt, vCnt, aCnt, mCnt };
}

async function carregarEstatisticas() {
  const div = $("#lista-estatisticas");
  if (!div) return;
  div.innerHTML = "Carregando...";

  const [{ data: profiles }, { data: games }, { data: preds }] = await Promise.all([
    sb.from("profiles").select("id, display_name"),
    sb.from("games").select("*").eq("closed", true),
    sb.from("predictions").select("*"),
  ]);

  const gameById = {};
  (games || []).forEach(g => gameById[g.id] = g);

  // Ordena jogos encerrados por data, para calcular sequências
  const closedOrdered = (games || []).slice().sort((a, b) => new Date(a.match_at) - new Date(b.match_at));

  // Agrupa predictions por usuário
  const predsByUser = {};
  (preds || []).forEach(p => {
    (predsByUser[p.user_id] = predsByUser[p.user_id] || []).push(p);
  });

  // Calcula stats por usuário
  const stats = (profiles || []).map(prof => {
    const meus = predsByUser[prof.id] || [];
    const totalPalpites = meus.length;
    let totalClosed = 0, acertos = 0;
    let totP = 0, totV = 0, totA = 0, totM = 0, totalPts = 0;

    const predByGame = {};
    meus.forEach(p => predByGame[p.game_id] = p);

    // sequência (somente jogos encerrados em ordem cronológica em que o jogador palpitou)
    let melhorSeq = 0, seqAtual = 0;
    closedOrdered.forEach(g => {
      const p = predByGame[g.id];
      if (!p) return;
      totalClosed += 1;
      const r = calcPontosPorPredicao(g, p);
      totP += r.pCnt; totV += r.vCnt; totA += r.aCnt; totM += r.mCnt;
      totalPts += r.pts;
      if (r.pts > 0) { acertos += 1; seqAtual += 1; if (seqAtual > melhorSeq) melhorSeq = seqAtual; }
      else { seqAtual = 0; }
    });

    const pctAcerto = totalClosed ? (acertos / totalClosed) * 100 : 0;

    // Especialidade: categoria com mais pontos
    const cats = [
      { nome: "placar exato", pts: totP * 3 },
      { nome: "vencedor",     pts: totV * 1 },
      { nome: "artilheiros",  pts: totA * 1 },
      { nome: "minutos",      pts: totM * 2 },
    ];
    cats.sort((a, b) => b.pts - a.pts);
    const especialidade = cats[0].pts > 0 ? cats[0].nome : "—";

    return {
      id: prof.id,
      nome: prof.display_name || "(sem nome)",
      totalPalpites, pctAcerto, melhorSeq, especialidade, totalPts,
    };
  });

  // Top X% baseado em pontos (1 = melhor)
  const ordenadosPts = stats.slice().sort((a, b) => b.totalPts - a.totalPts);
  const totalJog = ordenadosPts.length || 1;
  const posicao = {};
  ordenadosPts.forEach((s, i) => posicao[s.id] = i + 1);

  // Exibe ordenado por pontos desc, mas escondendo quem nunca palpitou
  const visiveis = ordenadosPts.filter(s => s.totalPalpites > 0);
  if (!visiveis.length) { div.innerHTML = "<p>Ainda não há palpites para gerar estatísticas.</p>"; return; }

  div.innerHTML = "";
  visiveis.forEach(s => {
    const pos = posicao[s.id];
    const topPct = Math.max(1, Math.round((pos / totalJog) * 100));
    const card = document.createElement("div");
    card.className = "card-jogo";
    card.innerHTML = `
      <h3>${escapeHtml(s.nome)}</h3>
      <div class="stat-line">📊 <b>${s.totalPalpites}</b> palpites realizados</div>
      <div class="stat-line">🎯 <b>${s.pctAcerto.toFixed(1).replace(".", ",")}%</b> de acerto</div>
      <div class="stat-line">🔥 Melhor sequência: <b>${s.melhorSeq}</b></div>
      <div class="stat-line">⚽ Especialidade: <b>${escapeHtml(s.especialidade)}</b></div>
      <div class="stat-line">🏆 Top <b>${topPct}%</b> da comunidade</div>
    `;
    div.appendChild(card);
  });
}
