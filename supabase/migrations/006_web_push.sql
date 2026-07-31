-- Web Push — notificações que chegam com o app fechado.
--
-- A migration 005 deixou as notificações configuráveis, mas quem as disparava
-- era o próprio navegador, num timer. Isso só funciona com o app aberto: PWA
-- instalado continua sendo uma página, e página fechada não roda nada. Web Push
-- inverte quem manda — o servidor envia, o push service do navegador acorda o
-- service worker, e a notificação aparece mesmo com tudo fechado.
--
-- Esta migration cria o que o servidor precisa para isso: onde entregar, e o
-- registro do que já foi entregue.

begin;

-- =========================================================
-- INSCRIÇÕES DE PUSH
-- =========================================================
-- Uma linha por navegador, não por usuário. O médico com um desktop no
-- consultório e um celular no bolso tem duas, e as duas recebem — é a mesma
-- ideia do log local da fase 1 (entrega é do aparelho, preferência é da
-- pessoa), só que agora o servidor precisa saber de todos os aparelhos.
create table if not exists public.push_subscriptions (
  -- O endpoint é a chave primária porque ele *é* a identidade que o push
  -- service emitiu. Reinscrever no mesmo navegador devolve o mesmo endpoint,
  -- então o upsert vira a escrita natural e não existe o caso de duplicar o
  -- mesmo aparelho por ter perdido um id interno.
  endpoint      text primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- As duas metades da chave de criptografia que o navegador gerou. O payload
  -- do push é cifrado com elas ponta a ponta (RFC 8291): nem o push service da
  -- Google nem o da Mozilla conseguem ler o nome de um paciente em trânsito.
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  -- Falhas que não são "inscrição morta" (410/404) acontecem: push service
  -- fora do ar, rede. Contar em vez de apagar na primeira dá margem para o
  -- serviço voltar, e ainda assim tira do caminho o endpoint que só dá erro.
  failure_count int not null default 0,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- O cliente só mexe nas próprias inscrições. Quem lê todas para enviar é a
-- Edge Function, com service_role, que passa por cima do RLS de propósito.
drop policy if exists "push subscriptions are private to the user" on public.push_subscriptions;
create policy "push subscriptions are private to the user"
  on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =========================================================
-- O QUE JÁ FOI ENVIADO
-- =========================================================
-- O log de deduplicação, que na fase 1 vivia no localStorage de cada aparelho.
--
-- As chaves são as mesmas de antes ('agenda:2026-07-31', 'created:<id>'): elas
-- nomeiam a *ocorrência*, nunca o instante do envio. É isso que deixa um cron de
-- um em um minuto ser seguro — a mesma ocorrência se reconhece no minuto
-- seguinte, sem nenhuma conta sobre quanto tempo passou.
--
-- Sair do localStorage não é só mudança de lugar, é um ganho de correção. Lá o
-- código só conseguia consultar-e-depois-escrever, com uma janela entre as duas
-- coisas. Aqui a chave primária faz o trabalho:
--
--   insert into notification_deliveries (user_id, dedupe_key)
--   values (...) on conflict do nothing returning dedupe_key;
--
-- O que voltar do `returning` é o que esta execução ganhou o direito de enviar.
-- Duas execuções sobrepostas do cron não conseguem enviar a mesma notificação,
-- porque reivindicar e registrar são a mesma instrução atômica.
create table if not exists public.notification_deliveries (
  user_id    uuid not null references auth.users (id) on delete cascade,
  dedupe_key text not null,
  sent_at    timestamptz not null default now(),
  primary key (user_id, dedupe_key)
);

create index if not exists notification_deliveries_sent_at_idx
  on public.notification_deliveries (sent_at);

-- RLS ligado e **nenhuma policy**, de propósito. Só a Edge Function
-- (service_role, que ignora RLS) lê e escreve aqui; nenhum cliente tem motivo
-- para ver o histórico de avisos. A ausência de policy é como isso se diz em
-- voz alta — tabela sem RLS seria legível por qualquer usuário autenticado.
alter table public.notification_deliveries enable row level security;

-- =========================================================
-- FUSO HORÁRIO E ADESÃO AO PUSH
-- =========================================================
-- `timezone` é o requisito que a versão local ganhava de graça. "07:30" queria
-- dizer 07:30 no aparelho que rodava o timer; no servidor não quer dizer nada
-- até alguém nomear o fuso.
--
-- É capturado do navegador (`Intl.DateTimeFormat().resolvedOptions().timeZone`)
-- quando a pessoa ativa as notificações, e **não** é atualizado a cada abertura
-- do app. Consulta é marcada em hora de relógio do consultório: o médico que
-- abre o app de outro país continua querendo o resumo no horário da clínica, não
-- às 07:30 de onde ele está.
alter table public.notification_preferences
  add column if not exists timezone text not null default 'America/Sao_Paulo';

comment on column public.notification_preferences.timezone is
  'Fuso usado para resolver os horários das notificações. Detectado do navegador ao ativar.';

-- Separado dos quatro switches: eles dizem *o que* avisar, este diz se a pessoa
-- chegou a autorizar o envio em algum aparelho. Sem ele não dá para distinguir
-- "não quer nada" de "quer, mas nunca clicou em Ativar" — e a segunda é a que
-- merece um empurrão na interface.
alter table public.notification_preferences
  add column if not exists push_enabled boolean not null default false;

commit;

-- =========================================================
-- LIMPEZA (rode depois de habilitar pg_cron)
-- =========================================================
-- `notification_deliveries` cresce a cada aviso, para sempre. As linhas de um
-- dia estão mortas assim que o dia acaba — a chave 'agenda:2026-07-31' nunca
-- mais vai ser consultada — então 30 dias é folga de sobra sobre qualquer
-- reprocessamento e mantém a tabela pequena.
--
-- select cron.schedule(
--   'purge-notification-deliveries',
--   '17 4 * * *',
--   $$delete from public.notification_deliveries where sent_at < now() - interval '30 days'$$
-- );
