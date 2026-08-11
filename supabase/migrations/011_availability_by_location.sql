-- Disponibilidade por local de atendimento (issue #40, ajuste da fase 1).
--
-- A fase 1 assumiu uma jornada só: "ela atende terça 14:00–18:00". Na prática
-- a médica tem jornadas diferentes por local — poucos dias reservados na
-- clínica, e atendimento domiciliar bem mais livre, com consultas mais longas
-- porque incluem deslocamento. Uma linha por dia da semana não consegue dizer
-- isso: "quais os horários livres de terça" passa a ter uma resposta por
-- local, e o `slot_duration_minutes` de uma visita domiciliar não é o mesmo da
-- clínica.
--
-- A dimensão nova é o `location` que `appointments` já grava desde a
-- `schema.sql` (oncovie | idc | home | hospital | teleconsult | other), e não
-- um enum novo de duas posições. Dois motivos:
--
--   1. Nada precisa ser derivado. Se a disponibilidade fosse "clínica vs
--      domiciliar", toda consulta teria que ser traduzida de `location` para
--      essa modalidade, e teleconsulta/hospitalar cairiam em "clínica" por
--      descarte — uma regra a mais para manter, que erra justamente nos casos
--      que não são nenhum dos dois.
--   2. É o que a issue #30 já tinha pedido: "a maneira honesta de representar
--      uma médica que está na Oncovie às segundas e no IDC às quartas, que o
--      enum `location` sugere e nada garante".
--
-- Atenção ao que isto NÃO separa: choque de horário. A médica é uma pessoa só,
-- então uma consulta na clínica e uma visita domiciliar às 09:00 continuam
-- sendo um conflito — e pior, com deslocamento no meio. O local decide quais
-- horários são *oferecidos* e quanto dura cada consulta; quem já ocupa a
-- agenda é o dia inteiro, sem filtro de local. Ver `conflictsAt` em
-- `src/domain/agenda/slot-conflicts.ts`.

begin;

-- =========================================================
-- REGRA SEMANAL
-- =========================================================
-- `default 'other'` faz o backfill sozinho, e 'other' é a escolha honesta para
-- as linhas escritas antes desta coluna existir: elas foram declaradas como "a
-- minha jornada", sem local nenhum: dizer que eram da Oncovie seria inventar um
-- fato. A tela de Ajustes mostra essas linhas como "Outro" e a médica reatribui
-- em um clique.
alter table public.availability_rules
  add column if not exists location text not null default 'other';

-- O check não existe em `appointments.location` (lá o valor é só um comentário
-- no schema, porque o app Flutter escreve na tabela e uma constraint nova
-- poderia derrubá-lo). Aqui cabe: estas tabelas nasceram neste app e o Flutter
-- não as conhece, então o banco pode recusar um local que o app não entende em
-- vez de deixar `toAppointmentLocation` silenciosamente lê-lo como 'other'.
alter table public.availability_rules
  drop constraint if exists availability_rules_location_check;
alter table public.availability_rules
  add constraint availability_rules_location_check
  check (location in ('oncovie', 'idc', 'home', 'hospital', 'teleconsult', 'other'));

-- A chave do upsert muda junto: a linha que existe no máximo uma vez agora é
-- (médico, local, dia da semana), não (médico, dia da semana). Sem isto,
-- declarar domiciliar na terça sobrescreveria a terça da clínica — que é
-- exatamente o que este ajuste existe para permitir.
drop index if exists public.availability_rules_owner_weekday_idx;
create unique index if not exists availability_rules_owner_location_weekday_idx
  on public.availability_rules (owner_id, location, weekday);

-- =========================================================
-- EXCEÇÕES
-- =========================================================
-- Aqui `location` é nullable, e o null tem significado: "todos os locais".
--
-- É a diferença entre os dois usos de uma exceção. Um feriado ou uma semana de
-- férias fecha tudo — não existe "fechado só na clínica" num dia em que a
-- médica está viajando — e obrigar a escolher um local faria a médica declarar
-- o mesmo feriado seis vezes para fechar o dia de verdade. Já um horário
-- especial ("nesta quarta o domiciliar vai até mais tarde") é de um local só.
-- Null cobre o primeiro caso, que é o comum, e é o valor que as linhas
-- existentes já têm.
alter table public.availability_exceptions
  add column if not exists location text;

alter table public.availability_exceptions
  drop constraint if exists availability_exceptions_location_check;
alter table public.availability_exceptions
  add constraint availability_exceptions_location_check
  check (
    location is null
    or location in ('oncovie', 'idc', 'home', 'hospital', 'teleconsult', 'other')
  );

-- `nulls not distinct` é o ponto todo deste índice, e não um detalhe: num
-- índice único comum vários nulls não colidem entre si, então o médico
-- conseguiria cadastrar o mesmo feriado ("todos os locais") duas vezes — e a
-- segunda linha não teria como dizer qual das duas vale, que é justamente o
-- que o índice da 010 existia para impedir.
--
-- A alternativa seriam dois índices parciais (`where location is null` e
-- `where location is not null`), que funcionam em qualquer versão do Postgres.
-- Não servem aqui: o upsert da tela de Ajustes vai pelo PostgREST, cujo
-- parâmetro `on_conflict` aceita só nomes de coluna e não sabe expressar o
-- `where` que um índice parcial exige para ser inferido. Um índice único
-- inteiro é o que o `on conflict` do repositório consegue mirar.
--
-- Requer Postgres 15+.
drop index if exists public.availability_exceptions_owner_date_idx;

create unique index if not exists availability_exceptions_owner_date_location_idx
  on public.availability_exceptions (owner_id, exception_date, location)
  nulls not distinct;

commit;
