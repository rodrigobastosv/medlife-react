-- Notificações locais configuráveis.
--
-- Duas mudanças aditivas: uma coluna em `appointments` para saber *quem* criou
-- a consulta, e uma tabela nova com as preferências de notificação de cada
-- usuário. Nada aqui altera coluna existente nem muda tipo, porque o banco é
-- compartilhado com o app Flutter (`../medlife`), que continua lendo as mesmas
-- tabelas e nem percebe que estas colunas existem.

begin;

-- =========================================================
-- QUEM CRIOU A CONSULTA
-- =========================================================
-- A notificação "sua secretária marcou uma consulta" precisa distinguir quem
-- escreveu a linha. Hoje não dá: `owner_id` é sempre o médico, tanto na consulta
-- que ele mesmo cadastrou quanto na que a secretária cadastrou para ele.
--
-- O `default auth.uid()` faz o preenchimento acontecer sozinho, no banco, para
-- os dois apps ao mesmo tempo — ninguém precisa lembrar de mandar a coluna no
-- insert, e um cliente não consegue mentir sobre quem é (o valor vem do JWT, não
-- do corpo da requisição).
alter table public.appointments
  add column if not exists created_by uuid references auth.users (id);

alter table public.appointments
  alter column created_by set default auth.uid();

-- Sem backfill, de propósito. `update ... set created_by = owner_id` seria mais
-- bonito — nenhuma linha ficaria nula — mas afirmaria que o médico cadastrou
-- todo o histórico, o que é falso para tudo que a secretária lançou antes desta
-- migration. Null aqui significa "não se sabe", e o app trata "não se sabe" como
-- motivo para *não* notificar. Uma coluna nula honesta vale mais que um dado
-- inventado que ninguém consegue mais separar do verdadeiro.
comment on column public.appointments.created_by is
  'Quem criou a consulta (auth.uid() no insert). Null nas linhas anteriores à coluna.';

-- A leitura da notificação é "consultas deste médico, criadas por outra pessoa,
-- desde o último aviso" — ou seja, filtra por owner e varre do mais recente para
-- trás. O índice parcial deixa de fora justamente as linhas antigas sem autor,
-- que essa consulta nunca vai querer.
create index if not exists appointments_created_by_idx
  on public.appointments (owner_id, created_at desc)
  where created_by is not null;

-- =========================================================
-- PREFERÊNCIAS DE NOTIFICAÇÃO
-- =========================================================
-- A chave é `user_id`, e não `owner_id`. Em todo o resto do app o dono do dado é
-- o médico; aqui o dono é a *pessoa logada*. Uma secretária vinculada a três
-- médicos tem um jeito só de querer ser avisada, e ele acompanha ela quando
-- troca de médico ativo. Por isso esta tabela é a única do schema que não é
-- particionada por médico.
create table if not exists public.notification_preferences (
  user_id                 uuid primary key references auth.users (id) on delete cascade,

  -- "Você tem N consultas hoje", uma vez por dia, a partir do horário escolhido.
  daily_agenda_enabled    boolean not null default false,
  daily_agenda_time       time    not null default '07:30',

  -- "N pacientes para ligar hoje" — a fila de recalls vencidos.
  recalls_enabled         boolean not null default false,
  recalls_time            time    not null default '09:00',

  -- "Fulana marcou uma consulta". Só faz sentido para médico: é a agenda dele
  -- que outra pessoa escreveu. O app filtra por papel; a coluna existe para
  -- todos porque uma constraint por papel exigiria ler `profiles` num check,
  -- o que o Postgres não permite.
  new_appointment_enabled boolean not null default false,

  -- "Consulta com Fulano em 30 min".
  upcoming_visit_enabled  boolean not null default false,
  upcoming_lead_minutes   int     not null default 30,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Lista fechada em vez de um intervalo: o formulário oferece exatamente estas
  -- três opções, e um check que aceitasse "1 a 240" deixaria passar valor que a
  -- interface não sabe exibir de volta.
  constraint notification_preferences_lead_check
    check (upcoming_lead_minutes in (15, 30, 60))
);

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;

drop policy if exists "notification preferences are private to the user" on public.notification_preferences;
create policy "notification preferences are private to the user"
  on public.notification_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Sem seed. Quem nunca abriu a tela de ajustes não tem linha, e o app lê a
-- ausência como "tudo desligado" — que é o default de todas as colunas acima.
-- Popular a tabela para os usuários existentes daria o mesmo resultado e criaria
-- uma segunda fonte de verdade sobre o que é o padrão.
--
-- Tudo desligado é a escolha certa: notificação que ninguém pediu é exatamente o
-- que faz a pessoa bloquear a permissão no navegador — e permissão bloqueada não
-- dá para pedir de novo por JavaScript, então esse erro não tem volta.

commit;
