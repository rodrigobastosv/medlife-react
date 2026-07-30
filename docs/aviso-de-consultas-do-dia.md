# Avisar o médico que tem consultas no dia

Análise da issue [#6](https://github.com/rodrigobastosv/medlife-react/issues/6).
Nada aqui foi implementado — o objetivo é escolher o caminho antes de escrever
código, porque as opções custam de zero a várias tardes e algumas exigem mudança
de schema.

## A restrição que decide quase tudo

`appointments.scheduled_date` é **`date`**, não `timestamptz`:

```sql
-- supabase/migrations/schema.sql (repositório do app Flutter)
scheduled_date       date not null,
```

Ou seja: **o sistema não sabe a que horas é a consulta.** Isso elimina de
imediato qualquer aviso do tipo "sua consulta é daqui a 30 minutos" — não existe
dado para isso. O que dá para fazer hoje é exatamente o que a issue pede: um
aviso **diário**, do tipo "você tem 4 consultas hoje".

Se em algum momento a vontade for avisar por consulta, o primeiro passo não é
notificação, é uma coluna de horário (e aí o formulário, a agenda e os
relatórios acompanham). Vale decidir isso antes, porque muda o que se constrói
aqui.

## Um buraco mais barato que qualquer notificação

A Home diz **"Seu resumo de hoje"** e não mostra as consultas de hoje. Ela
mostra pacientes cadastrados, recalls pendentes e retornos futuros — nenhum dos
três é "o que eu tenho hoje":

```
src/features/home/home-page.tsx  → usePatientsCountQuery, usePendingRecallsQuery,
                                    useUpcomingReturnsQuery
```

Antes de qualquer infraestrutura de push, o aviso mais barato é a tela já
existente cumprir o que o subtítulo promete. Não substitui uma notificação (só
funciona quando o app é aberto), mas é meia hora de trabalho, não depende de
permissão do navegador e serve de base para todo o resto — qualquer opção abaixo
precisa da mesma consulta "consultas de hoje deste médico".

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

1. **Mostrar "consultas de hoje" na Home.** Barato, sem infraestrutura, conserta
   uma promessa que a tela já faz. Faça isso primeiro, independente do resto.
2. **E-mail diário** via `pg_cron` + Edge Function. Resolve o pedido da issue
   para valer (chega com o app fechado, em qualquer aparelho) sem tocar no
   cliente e sem depender de permissão.
3. **Web Push** só se, depois de (1) e (2), ainda houver vontade de ver o aviso
   na tela de bloqueio — e sabendo que no iPhone depende de instalar o app na
   tela de início.
4. **Notificação local no Flutter** apenas se o app Flutter for continuar sendo
   o que ela usa no dia a dia. Se o plano é migrar para o React, não invista
   aqui.

E, antes de qualquer coisa que dependa de horário: decidir se `scheduled_date`
vira `timestamptz`. Sem isso, o teto de qualquer opção é o aviso diário.

## Fontes

- [Web Push for Web Apps on iOS and iPadOS — WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [PWA iOS Limitations and Safari Support](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [Web Push in iOS: Add to Home Screen — Notificare](https://notificare.com/blog/2024/09/16/web-push-in-ios-add-to-home-screen/)
