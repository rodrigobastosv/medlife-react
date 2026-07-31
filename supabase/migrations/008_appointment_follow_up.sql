-- Acompanhamento: quando o *médico* liga para o paciente.
--
-- Não é o recall, e a diferença é de papel, não de grau. O recall é a data em
-- que a **secretária** entra em contato para marcar outra consulta — trabalho de
-- agenda. O acompanhamento é a data em que o **médico** entra em contato para
-- perguntar como o paciente está ou pedir alguma informação — trabalho clínico.
-- Duas pessoas diferentes, duas filas diferentes, duas notificações diferentes.
-- Guardar as duas na mesma coluna obrigaria a perguntar "de quem é essa tarefa?"
-- em todo lugar que a lê, e a resposta não está em lugar nenhum da linha.
--
-- Colunas aditivas e anuláveis, pelo mesmo motivo de `scheduled_time` (004): o
-- banco é compartilhado com o app Flutter (`../medlife`), que continua rodando e
-- lendo estas tabelas. Quem não seleciona a coluna não percebe que ela existe.
alter table public.appointments
  add column if not exists follow_up_date date,
  add column if not exists follow_up_time time;

comment on column public.appointments.follow_up_date is
  'Data em que o médico vai contatar o paciente para acompanhamento. Null = sem acompanhamento previsto.';

comment on column public.appointments.follow_up_time is
  'Hora do acompanhamento. Null é legítimo aqui — ao contrário de scheduled_time, o formulário não exige.';

-- A fila de acompanhamentos é lida por data e hora, filtrada por médico, e só
-- olha para linhas que têm data. O índice parcial acompanha exatamente essa
-- consulta: sem o `where`, ele indexaria uma coluna que é null na grande maioria
-- das consultas, que é justamente o conjunto que a query nunca visita.
--
-- `nulls first` na hora: um acompanhamento marcado só com a data vence no começo
-- do dia, e não depois de todos os que têm horário.
create index if not exists appointments_follow_up_idx
  on public.appointments (owner_id, follow_up_date, follow_up_time nulls first)
  where follow_up_date is not null;

-- =========================================================
-- PREFERÊNCIA DE NOTIFICAÇÃO
-- =========================================================
-- Sem `follow_ups_time` ao lado, e essa ausência é a diferença de desenho em
-- relação ao recall.
--
-- O recall é um resumo: "N pacientes esperando contato", uma vez por dia, no
-- horário que a pessoa escolheu — porque um recall vencido não tem hora, só
-- data. O acompanhamento tem hora própria, marcada por consulta, e o médico a
-- escolheu por um motivo. Um horário de resumo aqui competiria com ela, e o
-- aviso chegaria na hora errada de propósito.
--
-- Quem não preencher a hora recebe o aviso no começo do dia; é o que o
-- `nulls first` do índice acima já diz.
alter table public.notification_preferences
  add column if not exists follow_ups_enabled boolean not null default false;

comment on column public.notification_preferences.follow_ups_enabled is
  'Avisar o médico no horário de cada acompanhamento. Só é oferecida a médicos; a coluna existe para todos porque um check por papel precisaria ler profiles.';
