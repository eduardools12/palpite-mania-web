## Objetivo
Migrar o bolão (em `public/bolao/`) de `localStorage` para um backend real usando **Lovable Cloud** (PostgreSQL + Auth + API automática), mantendo o site 100% em **HTML, CSS e JavaScript puros** (sem React), com Supabase JS carregado via CDN.

Ao final, você terá os 3 arquivos (`index.html`, `style.css`, `script.js`) prontos e funcionais, com ranking compartilhado em tempo real entre todos os jogadores.

---

## 1. Ativar Lovable Cloud
Provisiona automaticamente:
- Banco PostgreSQL
- Sistema de autenticação (e-mail + senha)
- API REST/Realtime
- Hospedagem 24/7 (sua máquina não precisa ficar ligada)

## 2. Estrutura do banco de dados

```text
profiles            → nome de exibição de cada jogador (1:1 com auth.users)
user_roles          → papéis (admin | user) — tabela separada por segurança
games               → jogos postados pelo moderador (times, data, placar final, gol)
predictions         → palpites de cada jogador para cada jogo
                      (placar_a, placar_b, jogador_gol)
```

Pontuação calculada por uma **view** `rankings`:
- Placar exato → 3 pontos
- Vencedor correto → 1 ponto
- Jogador que fez o gol correto → +1 ponto

Atualização em tempo real via **Supabase Realtime** (canal `postgres_changes` na tabela `games`).

## 3. Segurança (RLS)
- Qualquer usuário autenticado vê jogos, palpites próprios e o ranking.
- Só o próprio jogador insere/edita os palpites dele.
- Só admins criam jogos e lançam placar final.
- Função `has_role()` security-definer para checar admin sem recursão.

## 4. Como o moderador vira admin
Primeiro usuário a se cadastrar recebe automaticamente o papel `admin` (via trigger). Próximos viram `user`. A aba "Moderação" no site só aparece para admins.

## 5. Arquivos finais (mantidos em HTML/CSS/JS puro)

```text
public/bolao/
├── index.html   → estrutura + telas: Login, Jogos do dia, Meus palpites,
│                  Ranking, Moderação. Carrega Supabase JS via CDN.
├── style.css    → estilos (mantém o visual atual, ajustes p/ login/abas)
└── script.js    → toda a lógica:
                   • init Supabase (URL + anon key públicas)
                   • signUp / signIn / signOut
                   • CRUD de jogos (admin)
                   • envio de palpites (jogador)
                   • lançamento de placar (admin)
                   • render do ranking + subscription realtime
                   • comentários explicando cada seção
```

Cada bloco do `script.js` virá comentado deixando claro o papel (autenticação, jogos, palpites, ranking, realtime, moderação) — como você pediu na primeira mensagem.

## 6. O que muda para você
- Acessa o site, cria conta com e-mail + senha.
- O primeiro cadastro é o seu (vira admin).
- Compartilha o link publicado com os amigos — cada um cria a própria conta.
- Você posta jogos e placares pela aba Moderação; todos veem o ranking atualizar em tempo real, de qualquer dispositivo.

---

## Detalhes técnicos (opcional)
- SDK: `@supabase/supabase-js@2` via `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">`.
- URL e anon key são públicas (seguras no front, protegidas por RLS).
- Realtime: `supabase.channel('public:games').on('postgres_changes', ...)` para reatualizar ranking quando placar muda.
- Migrations SQL criam: enum `app_role`, tabelas + GRANTs + RLS + policies + trigger de auto-perfil + trigger de primeiro-admin + view de ranking.

Posso prosseguir?
