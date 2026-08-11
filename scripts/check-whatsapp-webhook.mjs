/**
 * Prova a camada que fala com a Meta: a assinatura e a leitura do payload.
 *
 * `supabase/functions/whatsapp/meta.ts` não usa nenhuma API exclusiva do Deno —
 * só `crypto.subtle`, `fetch` e `TextEncoder`, que existem no Node. Isso o torna
 * a única parte da função que dá para provar sem a conta da Meta e sem publicar
 * nada, e é justamente a parte que mais precisa de prova: `verifySignature` é a
 * única coisa entre uma URL pública e alguém marcando consultas em nome de um
 * paciente qualquer.
 *
 *   node scripts/check-whatsapp-webhook.mjs
 */
import { createJiti } from 'jiti';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(root, {});
const meta = await jiti.import(join(root, 'supabase/functions/whatsapp/meta.ts'));

let failures = 0;
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures += 1;
    console.log(`FAIL ${name}\n  esperado ${e}\n  obtido   ${a}`);
  } else {
    console.log(`ok   ${name}`);
  }
};

/* --- Assinatura ------------------------------------------------------------ */

const SECRET = 'segredo-do-app-da-meta';
const BODY = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
const sign = (body, secret = SECRET) =>
  'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

check(
  'assinatura correta passa',
  await meta.verifySignature({ rawBody: BODY, header: sign(BODY), appSecret: SECRET }),
  true,
);
check(
  'corpo adulterado é recusado',
  await meta.verifySignature({
    rawBody: BODY.replace('entry', 'entrz'),
    header: sign(BODY),
    appSecret: SECRET,
  }),
  false,
);
check(
  'segredo errado é recusado',
  await meta.verifySignature({
    rawBody: BODY,
    header: sign(BODY, 'outro-segredo'),
    appSecret: SECRET,
  }),
  false,
);
check(
  'sem cabeçalho é recusado',
  await meta.verifySignature({ rawBody: BODY, header: null, appSecret: SECRET }),
  false,
);
check(
  'cabeçalho sem o prefixo sha256= é recusado',
  await meta.verifySignature({
    rawBody: BODY,
    header: sign(BODY).slice('sha256='.length),
    appSecret: SECRET,
  }),
  false,
);
check(
  'assinatura truncada é recusada (o comprimento é conferido antes)',
  await meta.verifySignature({
    rawBody: BODY,
    header: sign(BODY).slice(0, -2),
    appSecret: SECRET,
  }),
  false,
);
// O motivo de reusar os bytes crus em vez de reserializar: as mesmas chaves em
// outra ordem são o mesmo objeto e um corpo diferente.
check(
  'reserializar o mesmo JSON quebra a assinatura — por isso o corpo cru é reusado',
  await meta.verifySignature({
    rawBody: JSON.stringify({ entry: [], object: 'whatsapp_business_account' }),
    header: sign(BODY),
    appSecret: SECRET,
  }),
  false,
);

/* --- Leitura do payload ---------------------------------------------------- */

const payload = (messages) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'waba-1',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '5585999990000', phone_number_id: 'pni-1' },
            messages,
          },
        },
      ],
    },
  ],
});

const textMessage = {
  from: '5585988887777',
  id: 'wamid.1',
  timestamp: '1770000000',
  type: 'text',
  text: { body: 'oi, queria marcar uma consulta' },
};

check('mensagem de texto é lida', meta.parseIncoming(payload([textMessage])), [
  { phoneNumberId: 'pni-1', from: '5585988887777', text: 'oi, queria marcar uma consulta' },
]);
check(
  'recibo de entrega não é mensagem',
  meta.parseIncoming({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: 'pni-1' },
              statuses: [{ id: 'wamid.1', status: 'delivered' }],
            },
          },
        ],
      },
    ],
  }),
  [],
);
check(
  'áudio é ignorado — a função não transcreve',
  meta.parseIncoming(payload([{ from: '5585988887777', type: 'audio', audio: { id: 'a' } }])),
  [],
);
check(
  'texto e áudio juntos: só o texto sai',
  meta.parseIncoming(payload([{ from: '55859', type: 'audio' }, textMessage])),
  [{ phoneNumberId: 'pni-1', from: '5585988887777', text: 'oi, queria marcar uma consulta' }],
);
check('payload vazio', meta.parseIncoming({}), []);
check('payload nulo não explode', meta.parseIncoming(null), []);
check('payload de outro formato não explode', meta.parseIncoming({ entry: 'nao-e-array' }), []);
check(
  'mensagem sem metadata é descartada, não vira uma mensagem sem dono',
  meta.parseIncoming({ entry: [{ changes: [{ value: { messages: [textMessage] } }] }] }),
  [],
);

console.log(failures === 0 ? '\nTudo passou.' : `\n${failures} falha(s).`);
process.exit(failures === 0 ? 0 : 1);
