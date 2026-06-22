# Integração API-Football — SQL para revisão

Escopo confirmado: Copa do Mundo 2026 apenas (`league=1`, `season=2026`).
Sem cron automático. Sincronização manual via painel admin.
**Nada é executado até você aprovar este documento.**

---

## Migração 1 — Catálogo de jogadores

### 1.1 SQL completo

```sql
-- ============================================================
-- Migração 1: catálogo de jogadores oficiais (API-Football)
-- ============================================================

CREATE TABLE public.players (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_player_id   integer NOT NULL UNIQUE,
  name            text    NOT NULL,
  photo           text,
  position        text,
  team_id         integer,
  team_name       text,
  nationality     text,
  age             integer,
  height          text,
  weight          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Índices de busca (autocomplete por nome + filtro por seleção)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX players_name_trgm_idx ON public.players USING gin (name gin_trgm_ops);
CREATE INDEX players_team_id_idx   ON public.players (team_id);

-- GRANTs (catálogo público para autenticados; escrita só service_role)
GRANT SELECT ON public.players TO authenticated;
GRANT ALL    ON public.players TO service_role;

-- RLS
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players visible to authenticated"
  ON public.players FOR SELECT TO authenticated USING (true);

-- Sem policies de INSERT/UPDATE/DELETE → bloqueado para anon/authenticated.
-- Escrita só por service_role (edge functions de sync), que ignora RLS.

-- Trigger de updated_at (reaproveita função existente)
CREATE TRIGGER update_players_updated_at
  BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

### 1.2 Rollback

```sql
DROP TRIGGER IF EXISTS update_players_updated_at ON public.players;
DROP TABLE  IF EXISTS public.players;
-- pg_trgm é deixada instalada (extensão é segura e pode ser usada em outros lugares)
```

---

## Migração 2 — Campos API em `games` e `predictions`

### 2.1 SQL completo

```sql
-- ============================================================
-- Migração 2: vincular games/predictions a IDs da API-Football
-- ============================================================

-- games: metadados da API + IDs de artilheiros e times do gol
ALTER TABLE public.games
  ADD COLUMN api_fixture_id     integer UNIQUE,
  ADD COLUMN api_league_id      integer,
  ADD COLUMN api_season         integer,
  ADD COLUMN round              text,
  ADD COLUMN stage              text,
  ADD COLUMN status             text,
  ADD COLUMN last_sync          timestamptz,
  ADD COLUMN home_team_api_id   integer,
  ADD COLUMN away_team_api_id   integer,
  ADD COLUMN scorer_player_ids  integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN scorer_team_ids    integer[] NOT NULL DEFAULT '{}';

-- predictions: ids dos jogadores escolhidos no combobox (paralelo aos textos)
ALTER TABLE public.predictions
  ADD COLUMN guess_scorer_player_ids integer[] NOT NULL DEFAULT '{}';
```

**Notas importantes:**
- Todas as colunas são `nullable` ou têm `DEFAULT '{}'` → **nenhum registro existente é tocado**.
- `scorers`, `minutes`, `guess_scorers`, `guess_minutes` (texto) **permanecem intactos**.
- A pontuação atual continua funcionando exatamente igual para registros antigos.
- `scorer_player_ids[i]` é paralelo a `scorers[i]` (mesmo índice = mesmo gol).
- `scorer_team_ids[i]` é paralelo a `scorers[i]` (qual seleção fez o gol).

### 2.2 Rollback

```sql
ALTER TABLE public.predictions
  DROP COLUMN IF EXISTS guess_scorer_player_ids;

ALTER TABLE public.games
  DROP COLUMN IF EXISTS scorer_team_ids,
  DROP COLUMN IF EXISTS scorer_player_ids,
  DROP COLUMN IF EXISTS away_team_api_id,
  DROP COLUMN IF EXISTS home_team_api_id,
  DROP COLUMN IF EXISTS last_sync,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS stage,
  DROP COLUMN IF EXISTS round,
  DROP COLUMN IF EXISTS api_season,
  DROP COLUMN IF EXISTS api_league_id,
  DROP COLUMN IF EXISTS api_fixture_id;
```

---

## Migração 3 — View `rankings` com fallback por ID

### 3.1 Regra de pontuação (inalterada)

- **P** = 3 pts se `guess_home == score_home AND guess_away == score_away`
- **V** = 1 pt se acertou o vencedor/empate (mas não o placar exato)
- **A** = 1 pt por gol em que acertou o jogador
- **M** = 2 pts por gol em que acertou o minuto

**Único ponto que muda:** como casar artilheiro previsto x artilheiro real.

### 3.2 Lógica de match de artilheiro (nova)

Para cada gol previsto no palpite:

1. **Se o gol previsto tem `guess_scorer_player_ids[j]` definido (!= 0) E o gol real tem `scorer_player_ids[i]` definido (!= 0):**
   match por ID — `scorer_player_ids[i] == guess_scorer_player_ids[j]`
2. **Senão (qualquer um dos dois é 0/ausente):**
   fallback para o match textual atual — `lower(scorers[i]) == lower(guess_scorers[j])`

Isso garante:
- Palpites antigos (sem IDs) continuam contando como hoje.
- Jogos antigos (sem `scorer_player_ids`) continuam contando como hoje.
- Apenas quando os DOIS lados têm ID a comparação muda para ID — e nesse caso ID é mais confiável que texto.

### 3.3 SQL completo da view

```sql
CREATE OR REPLACE VIEW public.rankings
WITH (security_invoker = true) AS
WITH per_pred AS (
  SELECT
    p.user_id,
    p.game_id,
    -- P: placar exato
    CASE WHEN p.guess_home = g.score_home
          AND p.guess_away = g.score_away THEN 1 ELSE 0 END AS p_cnt,
    -- V: vencedor (mas não placar exato)
    CASE WHEN (p.guess_home = g.score_home AND p.guess_away = g.score_away) THEN 0
         WHEN sign(p.guess_home - p.guess_away)
              = sign(g.score_home - g.score_away) THEN 1
         ELSE 0 END AS v_cnt,
    -- A: artilheiros acertados (com fallback id/texto, sem duplo uso)
    (
      SELECT COALESCE(SUM(matched), 0)::int FROM (
        SELECT
          -- para cada gol REAL i, tenta achar um palpite j ainda não usado
          (
            SELECT 1 FROM generate_subscripts(p.guess_scorers, 1) AS j
            WHERE NOT (j = ANY(used_a))
              AND (
                -- match por ID se ambos têm
                (COALESCE((p.guess_scorer_player_ids)[j], 0) <> 0
                 AND COALESCE((g.scorer_player_ids)[i], 0) <> 0
                 AND (p.guess_scorer_player_ids)[j] = (g.scorer_player_ids)[i])
                OR
                -- fallback textual
                (
                  COALESCE(NULLIF(lower(trim((g.scorers)[i])), ''), '__x__')
                  = COALESCE(NULLIF(lower(trim((p.guess_scorers)[j])), ''), '__y__')
                )
              )
            LIMIT 1
          ) AS matched,
          -- ... (ver nota abaixo)
          1 AS used_marker
        FROM generate_subscripts(g.scorers, 1) AS i
        CROSS JOIN LATERAL (SELECT ARRAY[]::int[] AS used_a) u
      ) s
    ) AS a_cnt,
    -- M: minutos acertados (mesma ideia, comparação direta de inteiros)
    (
      SELECT COUNT(*)::int FROM (
        SELECT DISTINCT ON ((g.minutes)[i]) i
        FROM generate_subscripts(g.minutes, 1) AS i
        WHERE (g.minutes)[i] IS NOT NULL
          AND (g.minutes)[i] = ANY(p.guess_minutes)
      ) m
    ) AS m_cnt
  FROM public.predictions p
  JOIN public.games g ON g.id = p.game_id
  WHERE g.closed = true
    AND g.score_home IS NOT NULL
    AND g.score_away IS NOT NULL
)
SELECT
  pr.id            AS user_id,
  pr.display_name,
  COALESCE(SUM(pp.p_cnt), 0)::int AS p_count,
  COALESCE(SUM(pp.v_cnt), 0)::int AS v_count,
  COALESCE(SUM(pp.a_cnt), 0)::int AS a_count,
  COALESCE(SUM(pp.m_cnt), 0)::int AS m_count,
  (COALESCE(SUM(pp.p_cnt),0)*3
 + COALESCE(SUM(pp.v_cnt),0)*1
 + COALESCE(SUM(pp.a_cnt),0)*1
 + COALESCE(SUM(pp.m_cnt),0)*2)::int AS points
FROM public.profiles pr
LEFT JOIN per_pred pp ON pp.user_id = pr.id
GROUP BY pr.id, pr.display_name;

GRANT SELECT ON public.rankings TO authenticated, anon;
```

⚠️ **Nota técnica:** o "sem duplo uso" (não casar o mesmo palpite com 2 gols reais) é difícil de expressar 100% correto em SQL puro com array sem usar uma função. Vou propor **uma função `match_scorers_ids(...)` em PL/pgSQL** que replica exatamente o algoritmo do JS atual (`calcPontosPorPredicao` — "primeiro encontrado, marca como usado"). A view chama essa função.

Versão final proposta (mais limpa):

```sql
CREATE OR REPLACE FUNCTION public.count_scorer_matches(
  real_scorers     text[],
  real_player_ids  integer[],
  guess_scorers    text[],
  guess_player_ids integer[]
) RETURNS integer
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  i int; j int;
  total int := 0;
  used boolean[] := array_fill(false, ARRAY[COALESCE(array_length(guess_scorers,1),0)]);
  matched boolean;
BEGIN
  FOR i IN 1..COALESCE(array_length(real_scorers,1),0) LOOP
    matched := false;
    FOR j IN 1..COALESCE(array_length(guess_scorers,1),0) LOOP
      IF used[j] THEN CONTINUE; END IF;
      -- match por ID (preferencial)
      IF COALESCE(real_player_ids[i],0) <> 0
         AND COALESCE(guess_player_ids[j],0) <> 0 THEN
        IF real_player_ids[i] = guess_player_ids[j] THEN
          used[j] := true; total := total + 1; matched := true; EXIT;
        END IF;
      ELSE
        -- fallback textual
        IF NULLIF(lower(trim(real_scorers[i])),'') IS NOT NULL
           AND NULLIF(lower(trim(real_scorers[i])),'')
             = NULLIF(lower(trim(guess_scorers[j])),'') THEN
          used[j] := true; total := total + 1; matched := true; EXIT;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN total;
END $$;

CREATE OR REPLACE FUNCTION public.count_minute_matches(
  real_minutes  integer[],
  guess_minutes integer[]
) RETURNS integer
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  i int; j int;
  total int := 0;
  used boolean[] := array_fill(false, ARRAY[COALESCE(array_length(guess_minutes,1),0)]);
BEGIN
  FOR i IN 1..COALESCE(array_length(real_minutes,1),0) LOOP
    IF real_minutes[i] IS NULL THEN CONTINUE; END IF;
    FOR j IN 1..COALESCE(array_length(guess_minutes,1),0) LOOP
      IF used[j] OR guess_minutes[j] IS NULL THEN CONTINUE; END IF;
      IF real_minutes[i] = guess_minutes[j] THEN
        used[j] := true; total := total + 1; EXIT;
      END IF;
    END LOOP;
  END LOOP;
  RETURN total;
END $$;

CREATE OR REPLACE VIEW public.rankings
WITH (security_invoker = true) AS
WITH per_pred AS (
  SELECT
    p.user_id,
    CASE WHEN p.guess_home = g.score_home
          AND p.guess_away = g.score_away THEN 1 ELSE 0 END AS p_cnt,
    CASE WHEN (p.guess_home = g.score_home AND p.guess_away = g.score_away) THEN 0
         WHEN sign(p.guess_home - p.guess_away)
              = sign(g.score_home - g.score_away) THEN 1
         ELSE 0 END AS v_cnt,
    public.count_scorer_matches(
      g.scorers, g.scorer_player_ids,
      p.guess_scorers, p.guess_scorer_player_ids
    ) AS a_cnt,
    public.count_minute_matches(g.minutes, p.guess_minutes) AS m_cnt
  FROM public.predictions p
  JOIN public.games g ON g.id = p.game_id
  WHERE g.closed = true
    AND g.score_home IS NOT NULL
    AND g.score_away IS NOT NULL
)
SELECT
  pr.id AS user_id,
  pr.display_name,
  COALESCE(SUM(pp.p_cnt), 0)::int AS p_count,
  COALESCE(SUM(pp.v_cnt), 0)::int AS v_count,
  COALESCE(SUM(pp.a_cnt), 0)::int AS a_count,
  COALESCE(SUM(pp.m_cnt), 0)::int AS m_count,
  (COALESCE(SUM(pp.p_cnt),0)*3
 + COALESCE(SUM(pp.v_cnt),0)*1
 + COALESCE(SUM(pp.a_cnt),0)*1
 + COALESCE(SUM(pp.m_cnt),0)*2)::int AS points
FROM public.profiles pr
LEFT JOIN per_pred pp ON pp.user_id = pr.id
GROUP BY pr.id, pr.display_name;

GRANT SELECT ON public.rankings TO authenticated, anon;
```

### 3.4 Equivalência com o JS atual

A função `count_scorer_matches` reproduz exatamente o loop `forEach` + `usadosA[]` de `calcPontosPorPredicao` em `public/bolao/script.js`, com **uma única diferença intencional**: se ambos os lados têm ID válido (≠ 0), compara por ID em vez de texto.

Quando algum dos lados não tem ID (todos os registros atuais), o comportamento é **bit a bit idêntico** ao atual: trim + lower + primeira ocorrência marca como usada.

### 3.5 Rollback da view + funções

```sql
-- Restaurar view antiga (a versão imediatamente anterior será capturada
-- em snapshot antes do CREATE OR REPLACE — incluo o SQL exato da view atual
-- como bloco de rollback no arquivo da migração)
DROP VIEW IF EXISTS public.rankings;
-- ... (CREATE OR REPLACE VIEW public.rankings ... versão anterior)

DROP FUNCTION IF EXISTS public.count_scorer_matches(text[], integer[], text[], integer[]);
DROP FUNCTION IF EXISTS public.count_minute_matches(integer[], integer[]);
```

---

## Alteração em `calcPontosPorPredicao` (JS)

Arquivo: `public/bolao/script.js`. Mudança mínima — adiciona o mesmo fallback ID/texto, sem mudar nenhuma regra de pontuação.

```js
function calcPontosPorPredicao(g, p) {
  let pts = 0, pCnt = 0, vCnt = 0, aCnt = 0, mCnt = 0;

  // P / V — sem mudanças
  if (p.guess_home === g.score_home && p.guess_away === g.score_away) {
    pts += 3; pCnt = 1;
  } else {
    const realW = Math.sign(g.score_home - g.score_away);
    const palpW = Math.sign(p.guess_home - p.guess_away);
    if (realW === palpW) { pts += 1; vCnt = 1; }
  }

  // A — match por ID quando ambos têm; senão, texto (igual ao atual)
  const realScorers   = (g.scorers || []).map(s => (s || "").trim().toLowerCase());
  const realIds       = (g.scorer_player_ids || []);
  const guessScorers  = (p.guess_scorers || []).map(s => (s || "").trim().toLowerCase());
  const guessIds      = (p.guess_scorer_player_ids || []);
  const usadosA = new Array(guessScorers.length).fill(false);

  realScorers.forEach((rs, i) => {
    const rid = realIds[i] || 0;
    for (let j = 0; j < guessScorers.length; j++) {
      if (usadosA[j]) continue;
      const gid = guessIds[j] || 0;
      const matchById   = rid !== 0 && gid !== 0 && rid === gid;
      const matchByText = (rid === 0 || gid === 0) && rs && rs === guessScorers[j];
      if (matchById || matchByText) {
        usadosA[j] = true; aCnt += 1; pts += 1; break;
      }
    }
  });

  // M — sem mudanças
  const realMinutes = (g.minutes || []);
  const usadosM = new Array(realMinutes.length).fill(false);
  (p.guess_minutes || []).forEach(gm => {
    if (gm == null || gm === "") return;
    const gmN = parseInt(gm, 10);
    const idx = realMinutes.findIndex((rm, i) =>
      !usadosM[i] && rm != null && parseInt(rm, 10) === gmN);
    if (idx >= 0) { usadosM[idx] = true; mCnt += 1; pts += 2; }
  });

  return { pts, pCnt, vCnt, aCnt, mCnt };
}
```

---

## Resumo do impacto

| Item | Estado após as 3 migrações |
|---|---|
| Tabela `games` | Mesma estrutura + colunas novas opcionais. Dados antigos intactos. |
| Tabela `predictions` | Mesma estrutura + 1 coluna nova com default `{}`. Dados antigos intactos. |
| View `rankings` | Mesmo schema de saída (mesmas colunas). Mesma pontuação para dados existentes. |
| `season_predictions` | **Não tocada.** |
| `profiles`, `user_roles` | **Não tocadas.** |
| RLS / policies existentes | **Não tocadas.** |
| Realtime em `games` | **Mantido** (publication não é alterada). |
| Ranking atual | Idêntico (fallback textual ativo até existirem IDs nos dois lados). |
| Histórico de palpites | Preservado integralmente. |

---

## Próximas fases (não executar agora)

Depois que você aprovar e eu rodar as 3 migrações, seguem (cada uma para nova aprovação):

- **Fase B:** segredo `API_FOOTBALL_KEY` (peço via add_secret quando você conseguir a chave) + edge functions:
  `apifootball-status`, `apifootball-import-fixtures` (league=1, season=2026),
  `apifootball-sync-players` (toda a competição), `apifootball-sync-fixture`
  (grava `scorers`, `minutes`, `scorer_player_ids`, `scorer_team_ids`),
  `apifootball-search-players` (autocomplete, filtrado por `home_team_api_id`/`away_team_api_id` da partida).
- **Fase C:** combobox de jogadores no front + aba admin "API Football".

---

## Pergunta para destravar

**Você aprova rodar as Migrações 1, 2 e 3 exatamente como estão acima?**
(Se quiser ajustar nomes de colunas, tipos, ou a lógica do match, me diga antes — depois de criada, mudar coluna em produção é mais chato.)
