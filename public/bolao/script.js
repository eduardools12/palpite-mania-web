/* =====================================================================
   BOLÃO - Lógica (JavaScript)
   ---------------------------------------------------------------------
   Aqui mora todo o COMPORTAMENTO do site:
     • troca de abas
     • cadastro/identificação do jogador
     • postagem de jogos pela moderação
     • registro dos palpites dos jogadores
     • lançamento do placar final + cálculo dos pontos
     • ranking atualizado em tempo real

   PERSISTÊNCIA:
     Usamos `localStorage` (armazenamento do navegador). Tudo é salvo
     em 3 "tabelas":
       - bolao.jogos    -> lista de jogos criados pela moderação
       - bolao.palpites -> lista de palpites (1 por jogador por jogo)
       - bolao.jogador  -> nome do jogador atual neste navegador

   REGRAS DE PONTUAÇÃO:
       +3 pts  -> acertou o placar exato
       +1 pt   -> acertou apenas o vencedor (ou empate)
       +1 pt   -> acertou o nome do jogador que fez o gol
   ===================================================================== */


/* ======================= 1. UTILITÁRIOS DE STORAGE ======================= */

// Lê uma "tabela" do localStorage (ou devolve [] se não existir).
function ler(chave) {
  try { return JSON.parse(localStorage.getItem(chave)) || []; }
  catch { return []; }
}

// Salva uma "tabela" no localStorage e dispara evento para atualizar a UI.
function salvar(chave, valor) {
  localStorage.setItem(chave, JSON.stringify(valor));
  // Eventos próprios para re-renderizar quando os dados mudarem
  window.dispatchEvent(new Event("bolao:mudou"));
}

// Gera um ID simples e único.
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);


/* ======================= 2. SISTEMA DE ABAS ============================== */

document.querySelectorAll(".aba-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    // tira a classe "ativa" de todos os botões e seções
    document.querySelectorAll(".aba-btn").forEach((b) => b.classList.remove("ativa"));
    document.querySelectorAll(".aba").forEach((s) => s.classList.remove("ativa"));
    // marca o botão clicado e mostra a seção correspondente
    btn.classList.add("ativa");
    document.getElementById(btn.dataset.aba).classList.add("ativa");
  });
});


/* ======================= 3. IDENTIFICAÇÃO DO JOGADOR ===================== */

const inputNome   = document.getElementById("nome-jogador");
const btnSalvar   = document.getElementById("btn-salvar-nome");
const labelAtual  = document.getElementById("jogador-atual");

function jogadorAtual() {
  return localStorage.getItem("bolao.jogador") || "";
}

function atualizarJogador() {
  const nome = jogadorAtual();
  labelAtual.textContent = nome ? `(${nome})` : "";
  inputNome.value = nome;
}

btnSalvar.addEventListener("click", () => {
  const nome = inputNome.value.trim();
  if (!nome) return alert("Digite seu nome para palpitar.");
  localStorage.setItem("bolao.jogador", nome);
  atualizarJogador();
  renderTudo();
});


/* ======================= 4. MODERAÇÃO: POSTAR JOGO ======================= */

document.getElementById("form-novo-jogo").addEventListener("submit", (e) => {
  e.preventDefault();
  const casa  = document.getElementById("time-casa").value.trim();
  const fora  = document.getElementById("time-fora").value.trim();
  const data  = document.getElementById("data-jogo").value;
  if (!casa || !fora || !data) return;

  const jogos = ler("bolao.jogos");
  jogos.push({
    id: novoId(),
    casa, fora, data,
    encerrado: false,
    placarCasa: null,
    placarFora: null,
    goleador:   null,
  });
  salvar("bolao.jogos", jogos);
  e.target.reset();
});


/* ======================= 5. JOGADOR: ENVIAR PALPITE ====================== */

// Procura o palpite que o jogador atual já fez nesse jogo (se houver).
function meuPalpite(idJogo) {
  const nome = jogadorAtual();
  return ler("bolao.palpites").find(
    (p) => p.idJogo === idJogo && p.jogador === nome
  );
}

function enviarPalpite(idJogo, placarCasa, placarFora, goleador) {
  const nome = jogadorAtual();
  if (!nome) return alert("Digite seu nome no topo antes de palpitar.");
  if (placarCasa === "" || placarFora === "") return alert("Preencha o placar.");

  const palpites = ler("bolao.palpites");
  // remove um palpite anterior do mesmo jogador para o mesmo jogo
  const filtrados = palpites.filter(
    (p) => !(p.idJogo === idJogo && p.jogador === nome)
  );
  filtrados.push({
    id: novoId(),
    idJogo,
    jogador: nome,
    placarCasa: Number(placarCasa),
    placarFora: Number(placarFora),
    goleador: (goleador || "").trim(),
  });
  salvar("bolao.palpites", filtrados);
}


/* ======================= 6. ENCERRAR JOGO + PONTUAÇÃO ==================== */

function encerrarJogo(idJogo, placarCasa, placarFora, goleador) {
  if (placarCasa === "" || placarFora === "") return alert("Informe o placar final.");

  const jogos = ler("bolao.jogos");
  const jogo  = jogos.find((j) => j.id === idJogo);
  if (!jogo) return;

  jogo.encerrado  = true;
  jogo.placarCasa = Number(placarCasa);
  jogo.placarFora = Number(placarFora);
  jogo.goleador   = (goleador || "").trim();

  salvar("bolao.jogos", jogos);
}

/**
 * Calcula os pontos de UM palpite com base no resultado real do jogo.
 *   +3 pts  -> placar exato
 *   +1 pt   -> só o vencedor (ou empate)
 *   +1 pt   -> goleador correto (comparação case-insensitive)
 */
function pontosDoPalpite(palpite, jogo) {
  if (!jogo || !jogo.encerrado) return 0;
  let pts = 0;

  const placarCerto =
    palpite.placarCasa === jogo.placarCasa &&
    palpite.placarFora === jogo.placarFora;

  if (placarCerto) {
    pts += 3;
  } else {
    const vencedorReal    = Math.sign(jogo.placarCasa    - jogo.placarFora);    // -1, 0 ou 1
    const vencedorPalpite = Math.sign(palpite.placarCasa - palpite.placarFora);
    if (vencedorReal === vencedorPalpite) pts += 1;
  }

  if (
    jogo.goleador &&
    palpite.goleador &&
    jogo.goleador.toLowerCase() === palpite.goleador.toLowerCase()
  ) {
    pts += 1;
  }

  return pts;
}


/* ======================= 7. RANKING EM TEMPO REAL ======================== */

function calcularRanking() {
  const jogos    = ler("bolao.jogos");
  const palpites = ler("bolao.palpites");
  const mapa     = {}; // { nome: pontos }

  palpites.forEach((p) => {
    const jogo = jogos.find((j) => j.id === p.idJogo);
    mapa[p.jogador] = (mapa[p.jogador] || 0) + pontosDoPalpite(p, jogo);
  });

  // garante que todos os jogadores que já palpitaram apareçam (mesmo com 0)
  return Object.entries(mapa)
    .map(([jogador, pontos]) => ({ jogador, pontos }))
    .sort((a, b) => b.pontos - a.pontos);
}


/* ======================= 8. RENDERIZAÇÃO (DESENHA A TELA) ================ */

// 8a) Cards de jogos abertos para o jogador palpitar
function renderJogos() {
  const lista = document.getElementById("lista-jogos");
  const jogos = ler("bolao.jogos");
  lista.innerHTML = "";

  if (jogos.length === 0) {
    lista.innerHTML = `<p class="vazio">Nenhum jogo postado ainda. Aguarde a moderação.</p>`;
    return;
  }

  jogos.forEach((j) => {
    const meu = meuPalpite(j.id);
    const dataFormatada = new Date(j.data).toLocaleString("pt-BR");

    const card = document.createElement("div");
    card.className = "card-jogo";
    card.innerHTML = `
      <div class="times"><span>${j.casa}</span><span>x</span><span>${j.fora}</span></div>
      <div class="quando">📅 ${dataFormatada}</div>

      ${j.encerrado
        ? `<div class="encerrado">Encerrado: ${j.placarCasa} x ${j.placarFora}
             ${j.goleador ? `• Goleador: <b>${j.goleador}</b>` : ""}</div>`
        : `
          <div class="linha-placar">
            <input type="number" min="0" class="palpite-casa" placeholder="0"
                   value="${meu ? meu.placarCasa : ""}" />
            <span>x</span>
            <input type="number" min="0" class="palpite-fora" placeholder="0"
                   value="${meu ? meu.placarFora : ""}" />
          </div>
          <input type="text" class="palpite-gol" placeholder="Quem fez o gol? (opcional)"
                 value="${meu ? meu.goleador : ""}" style="width:100%; margin-bottom:8px;" />
          <button class="btn-palpitar">${meu ? "Atualizar palpite" : "Enviar palpite"}</button>
          ${meu ? `<div class="ja-palpitou">✓ você já palpitou neste jogo</div>` : ""}
        `}
    `;

    // liga o botão de palpitar (só existe se o jogo está aberto)
    const btn = card.querySelector(".btn-palpitar");
    if (btn) {
      btn.addEventListener("click", () => {
        enviarPalpite(
          j.id,
          card.querySelector(".palpite-casa").value,
          card.querySelector(".palpite-fora").value,
          card.querySelector(".palpite-gol").value,
        );
      });
    }
    lista.appendChild(card);
  });
}

// 8b) Tabela do ranking
function renderRanking() {
  const corpo = document.getElementById("corpo-ranking");
  const rank  = calcularRanking();
  corpo.innerHTML = "";

  if (rank.length === 0) {
    corpo.innerHTML = `<tr><td colspan="3" class="vazio">Sem jogadores ainda.</td></tr>`;
    return;
  }
  rank.forEach((linha, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${i + 1}º</td><td>${linha.jogador}</td><td>${linha.pontos}</td>`;
    corpo.appendChild(tr);
  });
}

// 8c) Lista de jogos para a moderação encerrar (lançar placar)
function renderModeracao() {
  const div   = document.getElementById("lista-encerrar");
  const jogos = ler("bolao.jogos");
  div.innerHTML = "";

  const abertos = jogos.filter((j) => !j.encerrado);
  if (abertos.length === 0) {
    div.innerHTML = `<p class="vazio">Nenhum jogo aberto para encerrar.</p>`;
    return;
  }

  abertos.forEach((j) => {
    const box = document.createElement("div");
    box.className = "jogo-mod";
    box.innerHTML = `
      <div class="titulo">${j.casa} x ${j.fora}</div>
      <div class="controles">
        <input type="number" min="0" class="fc" placeholder="Casa" />
        <span>x</span>
        <input type="number" min="0" class="ff" placeholder="Fora" />
        <input type="text" class="gol" placeholder="Goleador (opcional)" />
        <button class="btn-encerrar">Lançar placar e encerrar</button>
      </div>
    `;
    box.querySelector(".btn-encerrar").addEventListener("click", () => {
      encerrarJogo(
        j.id,
        box.querySelector(".fc").value,
        box.querySelector(".ff").value,
        box.querySelector(".gol").value,
      );
    });
    div.appendChild(box);
  });
}

// Re-renderiza TUDO. Barato porque o volume de dados é pequeno.
function renderTudo() {
  renderJogos();
  renderRanking();
  renderModeracao();
}


/* ======================= 9. ATUALIZAÇÃO EM TEMPO REAL ==================== */

// Sempre que QUALQUER função salvar() rodar, redesenha a tela.
window.addEventListener("bolao:mudou", renderTudo);

// Se outra aba do navegador alterar o storage, atualiza aqui também.
window.addEventListener("storage", renderTudo);


/* ======================= 10. BOTÃO DE RESET ============================== */

document.getElementById("btn-resetar").addEventListener("click", () => {
  if (!confirm("Tem certeza? Isso apaga jogos, palpites e ranking.")) return;
  localStorage.removeItem("bolao.jogos");
  localStorage.removeItem("bolao.palpites");
  salvar("bolao.jogos", []); // dispara re-render
});


/* ======================= 11. INICIALIZAÇÃO =============================== */

atualizarJogador();
renderTudo();