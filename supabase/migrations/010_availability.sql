-- Modelo de disponibilidade (issue #40, fase 1).
--
-- Hoje uma consulta tem data e HH:mm, mas nada diz "ela atende Ter/Qui
-- 14:00–18:00 em blocos de 30 minutos" — o horário livre não existe como
-- conceito. Estas duas tabelas descrevem isso; quem transforma isso em
-- horários livres de um dia é a função pura `freeSlots`, em
-- `src/domain/agenda/availability.ts`, não o banco. É a base necessária antes
-- de um bot (WhatsApp ou qualquer outro) poder oferecer um horário — e também
-- o que a própria agenda pode passar a mostrar.
--
-- Aditivas, como todas as tabelas novas desde a 004: o app Flutter
-- (`../medlife`) compartilha o banco e simplesmente não as conhece.

begin;

-- =========================================================
-- HORÁRIO SEMANAL
-- =========================================================
-- No máximo uma linha por dia da semana — não uma tabela de intervalos
-- livres. Um médico com intervalo de almoço declara isso com um `end_time`
-- mais cedo e cobre a tarde com uma exceção pontual (abaixo) em vez de duas
-- linhas aqui; o ganho é que editar um dia é sempre um upsert na mesma linha,
-- sem a tela precisar descobrir "qual dos intervalos desta segunda é este".
--
-- `weekday` usa a mesma convenção de `Date.getDay()` no cliente e de
-- `extract(dow from date)` no Postgres: 0 = domingo .. 6 = sábado. Isso evita
-- uma tradução de índice em toda leitura ou escrita.
create table if not exists public.availability_rules (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references auth.users (id) on delete cascade,
  weekday               int not null,
  start_time            time not null,
  end_time              time not null,
  slot_duration_minutes int not null default 30,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint availability_rules_weekday_check check (weekday between 0 and 6),
  constraint availability_rules_time_check check (start_time < end_time),
  constraint availability_rules_slot_check check (slot_duration_minutes > 0)
);

-- Um médico não tem duas jornadas para a mesma segunda-feira: se tivesse,
-- "quais os horários livres de segunda" teria duas respostas. O upsert que a
-- tela de ajustes faz usa este índice como alvo do `on conflict`.
create unique index if not exists availability_rules_owner_weekday_idx
  on public.availability_rules (owner_id, weekday);

drop trigger if exists availability_rules_set_updated_at on public.availability_rules;
create trigger availability_rules_set_updated_at
  before update on public.availability_rules
  for each row execute function public.set_updated_at();

-- =========================================================
-- EXCEÇÕES
-- =========================================================
-- Um dia específico que quebra a regra semanal: feriado (fechado o dia
-- inteiro) ou horário especial (aberto, mas em outro intervalo). As duas
-- cabem numa linha porque a pergunta que uma exceção responde é sempre "o que
-- muda nesta data", nunca duas coisas ao mesmo tempo.
--
-- `is_closed = true` ignora as três colunas de horário — ficam null, e o
-- check abaixo é o que impede uma linha "aberta" sem dizer quando. O
-- intervalo de uma exceção aberta *substitui* a regra semanal só para
-- `exception_date`; nunca se soma a ela.
create table if not exists public.availability_exceptions (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references auth.users (id) on delete cascade,
  exception_date        date not null,
  is_closed             boolean not null default true,
  start_time            time,
  end_time              time,
  slot_duration_minutes int,
  note                  text,
  created_at            timestamptz not null default now(),
  constraint availability_exceptions_open_shape_check check (
    is_closed
    or (
      start_time is not null
      and end_time is not null
      and slot_duration_minutes is not null
      and start_time < end_time
      and slot_duration_minutes > 0
    )
  )
);

-- Uma exceção por data: a segunda linha para o mesmo dia não teria como dizer
-- qual das duas vale. A tela de ajustes faz upsert nesta chave, como acima.
create unique index if not exists availability_exceptions_owner_date_idx
  on public.availability_exceptions (owner_id, exception_date);

-- =========================================================
-- RLS
-- =========================================================
alter table public.availability_rules enable row level security;
alter table public.availability_exceptions enable row level security;

-- Leitura: o médico e as secretárias vinculadas a ele, como em `patients` e
-- `appointments` — saber os horários livres é útil para as duas (a agenda
-- pode mostrá-los, e é o que um bot de agendamento vai precisar ler).
drop policy if exists "availability rules are visible to the doctor and their secretaries"
  on public.availability_rules;
create policy "availability rules are visible to the doctor and their secretaries"
  on public.availability_rules for select
  using (public.can_access_doctor_data(owner_id));

drop policy if exists "availability exceptions are visible to the doctor and their secretaries"
  on public.availability_exceptions;
create policy "availability exceptions are visible to the doctor and their secretaries"
  on public.availability_exceptions for select
  using (public.can_access_doctor_data(owner_id));

-- Escrita: só o próprio médico. Diferente de criar uma consulta, declarar a
-- própria jornada não é uma tarefa operacional que se delega — por isso `for
-- all` aqui é mais estreito que a policy de leitura acima, e as duas se somam
-- (permissivas) em vez de uma substituir a outra.
drop policy if exists "doctor manages own availability rules" on public.availability_rules;
create policy "doctor manages own availability rules"
  on public.availability_rules for all
  using (owner_id = auth.uid() and public.is_doctor(auth.uid()))
  with check (owner_id = auth.uid() and public.is_doctor(auth.uid()));

drop policy if exists "doctor manages own availability exceptions" on public.availability_exceptions;
create policy "doctor manages own availability exceptions"
  on public.availability_exceptions for all
  using (owner_id = auth.uid() and public.is_doctor(auth.uid()))
  with check (owner_id = auth.uid() and public.is_doctor(auth.uid()));

grant select, insert, update, delete on public.availability_rules to authenticated;
grant select, insert, update, delete on public.availability_exceptions to authenticated;

commit;
