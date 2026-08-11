-- Atendimento automático no WhatsApp (issue #40, fases 2 e 3).
--
-- O objetivo mudou desde que a issue foi escrita: não é um bot de menu que
-- oferece horários, é uma IA que substitui o atendimento da secretaria. Isso
-- derruba a decisão de "menu estruturado, não texto livre" registrada lá — um
-- menu não responde "a doutora atende sábado?" nem "preciso remarcar a minha de
-- quinta". Quem responde é um modelo, e estas tabelas são o estado que ele não
-- pode carregar sozinho: a função é stateless e a conversa não é.
--
-- O que decide o que pode acontecer **não é o modelo**. `freeSlots` e
-- `conflictsAt`, em `src/domain/agenda/`, continuam sendo a autoridade sobre o
-- que é uma vaga e o que é um choque; o modelo propõe e as ferramentas
-- recusam. É a mesma separação que o app já faz entre domínio e UI, e é o que
-- impede que um erro de modelo vire uma consulta errada no banco.

begin;

-- =========================================================
-- DE QUEM É O NÚMERO
-- =========================================================
-- A Meta identifica o número que recebeu a mensagem por `phone_number_id`, não
-- pelo telefone em si. É esse id que o webhook recebe, então é por ele que se
-- descobre de qual médico é a agenda — e é o que torna isto capaz de atender
-- vários médicos sem mudar uma linha, mesmo começando com um.
create table if not exists public.whatsapp_numbers (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users (id) on delete cascade,
  -- `phone_number_id` da Cloud API, não o telefone. O telefone fica junto só
  -- para uma pessoa conseguir ler esta tabela sem consultar o painel da Meta.
  phone_number_id   text not null,
  display_number    text,
  created_at        timestamptz not null default now(),
  constraint whatsapp_numbers_phone_number_id_key unique (phone_number_id)
);

-- =========================================================
-- A CONVERSA
-- =========================================================
-- Uma linha por (número do consultório, telefone do paciente). A função Deno é
-- stateless e a Meta entrega uma mensagem por vez, então o histórico que o
-- modelo lê tem de estar em algum lugar — está aqui, em `transcript`.
--
-- `transcript` guarda os blocos da Messages API como vieram (texto e
-- ferramentas), e não um resumo: o formato que o modelo devolve é o formato que
-- ele precisa receber de volta no turno seguinte, e reescrever isso em prosa
-- perderia as chamadas de ferramenta que dão sentido ao que já foi feito.
--
-- `patient_id` é nullable porque um número desconhecido é o caso normal de quem
-- escreve pela primeira vez — o casamento acontece por telefone normalizado
-- (`toWhatsAppNumber`, em `src/domain/patients/patient-phone.ts`) e pode
-- simplesmente não encontrar ninguém.
create table if not exists public.whatsapp_conversations (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users (id) on delete cascade,
  -- E.164 sem o '+', como a Cloud API entrega e como `toWhatsAppNumber` produz.
  contact_phone     text not null,
  patient_id        uuid references public.patients (id) on delete set null,
  -- status: active | escalated | closed
  status            text not null default 'active',
  transcript        jsonb not null default '[]'::jsonb,
  -- Preenchidos quando a IA passa o caso para uma pessoa. `escalation_reason` é
  -- o texto que a IA escreveu, não um código: quem lê isso é um humano decidindo
  -- se corre, e uma categoria não diz o suficiente.
  escalated_at      timestamptz,
  escalation_reason text,
  last_message_at   timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint whatsapp_conversations_status_check
    check (status in ('active', 'escalated', 'closed')),
  -- Escalar sem dizer por quê é o mesmo que não escalar: quem abrir a fila
  -- precisa saber o que está olhando antes de decidir a ordem.
  constraint whatsapp_conversations_escalation_check check (
    (escalated_at is null and escalation_reason is null)
    or (escalated_at is not null and escalation_reason is not null)
  )
);

-- Uma conversa por contato por médico. O webhook faz upsert nesta chave a cada
-- mensagem recebida, então ela é o alvo do `on conflict` e não só uma garantia.
create unique index if not exists whatsapp_conversations_owner_contact_idx
  on public.whatsapp_conversations (owner_id, contact_phone);

-- A fila de atendimento humano, lida por data. Parcial porque a pergunta que
-- este índice serve é "o que está esperando alguém agora", e uma conversa
-- ativa ou fechada nunca é a resposta.
create index if not exists whatsapp_conversations_escalated_idx
  on public.whatsapp_conversations (owner_id, escalated_at desc)
  where status = 'escalated';

drop trigger if exists whatsapp_conversations_set_updated_at on public.whatsapp_conversations;
create trigger whatsapp_conversations_set_updated_at
  before update on public.whatsapp_conversations
  for each row execute function public.set_updated_at();

-- =========================================================
-- DE ONDE VEIO A CONSULTA
-- =========================================================
-- Coluna aditiva, com default, em vez de um valor novo no enum de `status`. O
-- app Flutter compartilha esta tabela e lê `status`; um valor que ele não
-- conhece apareceria como consulta em estado desconhecido lá. Uma coluna que
-- ele nunca seleciona é invisível para ele.
alter table public.appointments
  add column if not exists source text not null default 'app';

alter table public.appointments
  drop constraint if exists appointments_source_check;
alter table public.appointments
  add constraint appointments_source_check check (source in ('app', 'whatsapp'));

comment on column public.appointments.source is
  'app = marcada por uma pessoa na interface; whatsapp = marcada pela IA no atendimento automático. O default cobre todas as linhas anteriores, que por definição vieram do app.';

-- A IA escreve com o id de um usuário dedicado em `created_by`, o que faz a
-- `notify` avisar a médica de cada consulta marcada sem uma linha de código
-- nova: ela já anuncia consultas cujo `created_by` difere do dono da agenda.
create index if not exists appointments_source_idx
  on public.appointments (owner_id, source)
  where source <> 'app';

-- =========================================================
-- RLS
-- =========================================================
alter table public.whatsapp_numbers enable row level security;
alter table public.whatsapp_conversations enable row level security;

-- Leitura: o médico e as secretárias vinculadas — a fila de escalonamento é
-- trabalho operacional, e enquanto existir secretaria é ela quem atende.
drop policy if exists "whatsapp numbers are visible to the doctor and their secretaries"
  on public.whatsapp_numbers;
create policy "whatsapp numbers are visible to the doctor and their secretaries"
  on public.whatsapp_numbers for select
  using (public.can_access_doctor_data(owner_id));

drop policy if exists "whatsapp conversations are visible to the doctor and their secretaries"
  on public.whatsapp_conversations;
create policy "whatsapp conversations are visible to the doctor and their secretaries"
  on public.whatsapp_conversations for select
  using (public.can_access_doctor_data(owner_id));

-- Escrita pela interface: encerrar ou reabrir uma conversa escalada é uma ação
-- operacional, então a secretaria também pode. Note que a função Deno não passa
-- por aqui — ela roda com a service role, como a `notify`, e é o único caminho
-- que insere conversa.
drop policy if exists "conversations are updated by the doctor and their secretaries"
  on public.whatsapp_conversations;
create policy "conversations are updated by the doctor and their secretaries"
  on public.whatsapp_conversations for update
  using (public.can_access_doctor_data(owner_id))
  with check (public.can_access_doctor_data(owner_id));

-- O mapa de números é configuração da conta, não operação: só o próprio médico.
drop policy if exists "doctor manages own whatsapp numbers" on public.whatsapp_numbers;
create policy "doctor manages own whatsapp numbers"
  on public.whatsapp_numbers for all
  using (owner_id = auth.uid() and public.is_doctor(auth.uid()))
  with check (owner_id = auth.uid() and public.is_doctor(auth.uid()));

grant select, insert, update, delete on public.whatsapp_numbers to authenticated;
grant select, update on public.whatsapp_conversations to authenticated;

commit;
