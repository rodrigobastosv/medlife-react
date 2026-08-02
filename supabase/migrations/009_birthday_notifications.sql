-- Aniversariantes do dia: mais uma preferência de notificação.
--
-- O cartão de aniversariantes de Início já existe e mostra o mês inteiro. Ele
-- responde "quem eu ligo em algum momento deste mês"; a notificação responde
-- "quem faz aniversário *hoje*", que é a única forma dessa informação chegar a
-- tempo — parabéns dado no dia seguinte não é parabéns.
--
-- Aditivo e desligado por padrão, como todas as outras colunas desta tabela.
-- Nada aqui toca em `patients`: a data de nascimento já está lá desde sempre, e
-- quem decide o que é aniversário é a função `notify`, não o banco.

alter table public.notification_preferences
  add column if not exists birthdays_enabled boolean not null default false,
  add column if not exists birthdays_time    time    not null default '09:00';

comment on column public.notification_preferences.birthdays_enabled is
  'Avisar uma vez por dia quais pacientes fazem aniversário hoje.';

-- Tem horário próprio, ao contrário do acompanhamento (008) e pelo mesmo
-- critério: um aniversário é uma data sem hora, então o aviso é um resumo diário
-- e alguém precisa dizer a que horas ele chega. O default é o mesmo do recall
-- porque as duas tarefas são a mesma ligação, feita pela mesma pessoa, na mesma
-- parte da manhã.
comment on column public.notification_preferences.birthdays_time is
  'Horário do resumo diário de aniversariantes, no fuso do próprio usuário.';

-- Sem índice novo em `patients`. A varredura é "pacientes destes médicos com
-- data de nascimento preenchida", e o filtro que realmente corta é o `owner_id`,
-- que já é indexado. O mês e o dia não entram na query — comparar
-- `extract(month from birth_date)` exigiria um índice de expressão que só esta
-- leitura usaria, e ela roda no máximo uma vez por dia por usuário (ver o
-- comentário sobre o portão em `supabase/functions/notify/queries.ts`).
