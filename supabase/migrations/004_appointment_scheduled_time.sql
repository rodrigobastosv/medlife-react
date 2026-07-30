-- Horário da consulta.
--
-- Coluna nova em vez de converter `scheduled_date` para `timestamptz`, porque o
-- banco é compartilhado com o app Flutter (`../medlife`), que filtra intervalos
-- assim:
--
--   .gte('scheduled_date', '2026-07-01').lte('scheduled_date', '2026-07-31')
--
-- Com `date` isso pega o dia inteiro. Com `timestamptz`, `lte '2026-07-31'`
-- passa a significar `<= 2026-07-31 00:00:00` e some com todas as consultas do
-- último dia do intervalo — na agenda e nos relatórios, em silêncio, sem erro
-- nenhum. Uma coluna aditiva não quebra nada: quem não a seleciona nem percebe
-- que ela existe.
--
-- É `null` de propósito. As consultas já cadastradas não têm horário e não há
-- como inventá-lo — `not null` exigiria um default falso em cima de dados
-- históricos. Quem exige o horário é o formulário, para os registros novos.
alter table public.appointments
  add column if not exists scheduled_time time;

comment on column public.appointments.scheduled_time is
  'Hora da consulta. Null nas consultas anteriores à coluna; obrigatório no formulário.';

-- A agenda e a home ordenam por dia e depois por hora. `nulls first` mantém as
-- consultas antigas sem horário no topo do dia, em vez de escondê-las no fim.
create index if not exists appointments_scheduled_at_idx
  on public.appointments (owner_id, scheduled_date, scheduled_time nulls first);
