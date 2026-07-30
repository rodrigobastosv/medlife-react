# Avisar o médico que tem consultas no dia

Análise da issue [#6](https://github.com/rodrigobastosv/medlife-react/issues/6).

> **Decidido.** Duas coisas saíram desta análise e já estão neste PR: a consulta
> passou a ter **horário** (era a falha de fundo — veja abaixo) e a Home passou a
> mostrar **as consultas do dia**. O aviso propriamente dito — e-mail, push ou
> notificação local — fica para depois; a comparação das opções continua válida
> e está preservada abaixo para quando for a hora.

## A falha que a análise descobriu — corrigida

`appointments.scheduled_date` era **`date`**, não `timestamptz`:

```sql
-- supabase/migrations/schema.sql (repositório do app Flutter)
scheduled_date       date not null,
```

Ou seja: **o sistema não sabia a que horas era a consulta.** Isso não limitava só
a notificação — a agenda não tinha ordem dentro do dia, e ninguém conseguia
responder "que horas é meu paciente das 14h".

Corrigido em `supabase/migrations/004_appointment_scheduled_time.sql`, com uma
coluna nova em vez de converter `scheduled_date` para `timestamptz`. O motivo é
que o banco é compartilhado com o app Flutter, que filtra intervalos assim:

```dart
.gte('scheduled_date', fromStr).lte('scheduled_date', toStr)
```

Com `date`, isso pega o dia inteiro. Com `timestamptz`, `lte '2026-07-31'`
passaria a significar `<= 2026-07-31 00:00:00` e sumiria com todas as consultas
do último dia do intervalo — na agenda e nos relatórios, em silêncio, sem erro
nenhum. Uma coluna aditiva não quebra quem não a seleciona.

A coluna é `null` porque as consultas antigas não têm horário e não há como
inventá-lo. Quem exige é o formulário, para os registros novos.

Com o horário no lugar, o aviso por consulta ("seu paciente chega em 30
minutos") deixa de ser impossível e passa a ser só uma escolha de produto.

## Um buraco mais barato que qualquer notificação — fechado

A Home dizia **"Seu resumo de hoje"** e não mostrava as consultas de hoje:
mostrava pacientes cadastrados, recalls pendentes e retornos futuros — nenhum
dos três é "o que eu tenho hoje".

Agora a primeira seção da Home é **Consultas de hoje**, em ordem de horário, com
um contador ao lado dos outros dois.

Isso não substitui uma notificação: só funciona quando o app é aberto. Mas não
depende de permissão nenhuma, e era pré-requisito de qualquer opção abaixo —
todas precisam da mesma consulta "consultas de hoje deste médico", que agora
existe como `fetchAppointmentsOnDay`.

## As opções

### 1. Notificação local no navegador (`Notification` + `setTimeout`)

**Não serve.** Uma notificação agendada por `setTimeout` só dispara enquanto a
aba está aberta. Um aviso às 7h da manhã pressupõe justamente que o app está
fechado. Descartada — é a resposta direta ao "seria local notification?" da
issue: no navegador, esse conceito não existe do jeito que existe no mobile.

### 2. Web Push (PWA)

Funciona com o app fechado, mas hoje o projeto **não é um PWA**: não há
`manifest.json` nem service worker (`public/` só tem `logo.svg`). O caminho
completo é:

1. manifest + service worker;
2. chaves VAPID;
3. tabela de subscriptions (uma por dispositivo, com RLS);
4. algo que dispare de manhã — `pg_cron` + Edge Function no Supabase;
5. tela para pedir permissão.

E o detalhe que costuma matar a ideia: **no iOS, web push só funciona se o site
for adicionado à tela de início.** Não existe push para site aberto em aba do
Safari. O usuário precisa fazer Compartilhar → Adicionar à Tela de Início e
depois conceder permissão. Se a médica usa iPhone, isso é um passo manual que,
se ela trocar de aparelho ou remover o ícone, silenciosamente para de funcionar
— e ninguém percebe que parou. (Novidades recentes: o Safari 18.4 trouxe
Declarative Web Push, que dispensa o service worker, e no iOS 26 sites na tela
de início já abrem como web app. A exigência de instalar continua.)

Custo alto, resultado frágil no aparelho que mais importa.

### 3. Notificação local no app Flutter

O app Flutter (`../medlife`) existe, tem `android/` e `ios/`, e aponta para o
**mesmo projeto Supabase** — mesmas tabelas, mesmas contas. É o único lugar do
sistema onde "notificação local" significa o que a issue imagina: o SO agenda e
dispara, com o app fechado, sem servidor nenhum.

Hoje não há nenhuma dependência de notificação no `pubspec.yaml`. Seria
`flutter_local_notifications` com um agendamento diário recorrente. A limitação:
uma notificação local não consulta o banco na hora de disparar, então ou o texto
é genérico ("confira sua agenda de hoje") ou o app reagenda as notificações
sempre que sincroniza — o que só acontece quando ele é aberto.

Bom se o app Flutter continuar em uso. Ruim se a ideia é o React substituí-lo.

### 4. E-mail diário (Edge Function + `pg_cron`)

Subestimado, e provavelmente o melhor custo-benefício:

- **zero trabalho no cliente** — nada de service worker, manifest, permissão,
  instalação na tela de início;
- funciona em **qualquer** aparelho, incluindo o iPhone, e continua funcionando
  se ela trocar de celular;
- o endereço já existe (é a conta do Supabase);
- pode listar os pacientes do dia no corpo do e-mail, coisa que uma notificação
  não faz;
- fica no histórico — dá para conferir mais tarde.

O que precisa: habilitar `pg_cron` e `pg_net` no projeto, uma Edge Function que
faz o `select` do dia por médico e manda via um serviço de envio (Resend,
SendGrid), e um agendamento diário. Nenhuma mudança neste repositório.

O contra honesto: e-mail é fácil de ignorar, e chega junto com todo o resto da
caixa de entrada.

## Recomendação

Em etapas, do que já paga sozinho para o que só vale se o anterior não bastar:

1. ~~**Mostrar "consultas de hoje" na Home.**~~ **Feito neste PR**, junto com o
   horário da consulta.
2. **E-mail diário** via `pg_cron` + Edge Function. É o próximo passo quando o
   aviso com o app fechado virar prioridade: chega em qualquer aparelho, sem
   tocar no cliente e sem depender de permissão.
3. **Web Push** só se (2) não bastar e ainda houver vontade de ver o aviso na
   tela de bloqueio — sabendo que no iPhone depende de instalar o app na tela de
   início.
4. **Notificação local no Flutter** apenas se o app Flutter for continuar sendo
   o que ela usa no dia a dia. Se o plano é migrar para o React, não invista
   aqui.

Agora que existe horário, nada disso está mais limitado ao resumo diário — um
aviso por consulta passou a ser possível. Continua sendo decisão de produto, não
de schema.

## Fontes

- [Web Push for Web Apps on iOS and iPadOS — WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [PWA iOS Limitations and Safari Support](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [Web Push in iOS: Add to Home Screen — Notificare](https://notificare.com/blog/2024/09/16/web-push-in-ios-add-to-home-screen/)
