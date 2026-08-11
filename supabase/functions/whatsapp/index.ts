import { respond } from './agent.ts';
import { parseIncoming, sendText, verifySignature } from './meta.ts';
import {
  escalate,
  findOwnerByPhoneNumberId,
  findPatientByPhone,
  linkPatient,
  loadConversation,
  saveTranscript,
  serviceClient,
} from './queries.ts';
import { screenForUrgency, URGENCY_REPLY } from './urgency.ts';

/**
 * O webhook do WhatsApp: atendimento automático no lugar da secretária.
 *
 * Mesma forma da `notify` — função Deno, stateless, com todo o estado em
 * tabelas — e a mesma preocupação de porta pública, resolvida de outro jeito: a
 * `notify` é chamada pelo `pg_cron` com um segredo compartilhado, esta é
 * chamada pela Meta e prova a origem por assinatura HMAC.
 *
 * O caminho de uma mensagem:
 *
 *   Meta → assinatura → de quem é o número → conversa → triagem de urgência
 *        → modelo (com as ferramentas da agenda) → resposta pela Cloud API
 *
 * A triagem vem **antes** do modelo de propósito. Ver `urgency.ts`.
 */

Deno.serve(async (request: Request): Promise<Response> => {
  const appSecret = Deno.env.get('WHATSAPP_APP_SECRET');
  const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN');
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');

  /*
    O handshake de verificação da Meta. Ela chama uma vez, com GET, quando a URL
    é cadastrada no painel, e espera o `hub.challenge` de volta em texto puro —
    se vier JSON ou qualquer outra coisa, o cadastro falha sem dizer por quê.
  */
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && verifyToken !== undefined && token === verifyToken) {
      return new Response(challenge ?? '', { status: 200 });
    }
    return new Response('forbidden', { status: 403 });
  }

  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });

  if (appSecret === undefined || accessToken === undefined) {
    console.error('whatsapp: WHATSAPP_APP_SECRET e WHATSAPP_ACCESS_TOKEN são obrigatórios');
    return new Response('not configured', { status: 500 });
  }

  // Lido como texto **uma vez** e reusado: a assinatura é sobre estes bytes, e
  // reserializar depois de um parse mudaria a ordem das chaves e a assinatura
  // deixaria de bater por um motivo que nada tem a ver com autenticidade.
  const rawBody = await request.text();

  const signed = await verifySignature({
    rawBody,
    header: request.headers.get('x-hub-signature-256'),
    appSecret,
  });
  if (!signed) return new Response('bad signature', { status: 401 });

  /*
    A Meta reentrega o que não recebeu 200 rápido, e uma reentrega significa a
    mesma mensagem processada de novo — ou seja, uma segunda consulta marcada.
    Por isso o processamento acontece depois da resposta: confirmamos o
    recebimento primeiro e trabalhamos em seguida.

    O custo dessa escolha é que uma falha aqui não é reportada à Meta e não é
    reentregue — fica só no log da função. É a troca certa: uma mensagem perdida
    é recuperável por uma pessoa lendo a fila, uma consulta duplicada não.
  */
  queueMicrotask(() => {
    void handle(rawBody, accessToken).catch((error) => {
      console.error('whatsapp: falha ao processar', error);
    });
  });

  return new Response('ok', { status: 200 });
});

async function handle(rawBody: string, accessToken: string): Promise<void> {
  const messages = parseIncoming(safeParse(rawBody));
  if (messages.length === 0) return;

  const db = serviceClient();

  for (const message of messages) {
    const ownerId = await findOwnerByPhoneNumberId(db, message.phoneNumberId);
    if (ownerId === null) {
      // Número não cadastrado em `whatsapp_numbers`. Silêncio é o certo:
      // responder confirmaria a um desconhecido que este endpoint existe e
      // atende, e não há agenda para atender de qualquer forma.
      console.error(`whatsapp: phone_number_id ${message.phoneNumberId} não está mapeado`);
      continue;
    }

    const conversation = await loadConversation(db, ownerId, message.from);

    // Uma conversa já escalada não volta para a IA. Quem assume é a pessoa que
    // abriu a fila; a IA respondendo por cima disso confundiria os dois lados.
    if (conversation.status === 'escalated') continue;

    // A triagem roda antes do modelo, e o modelo não chega a ver a mensagem.
    const urgency = screenForUrgency(message.text);
    if (urgency !== null) {
      await escalate(db, conversation.id, `Triagem automática: "${urgency.term}" na mensagem.`);
      await sendText({
        phoneNumberId: message.phoneNumberId,
        to: message.from,
        text: URGENCY_REPLY,
        accessToken,
      });
      continue;
    }

    // O casamento por telefone acontece uma vez e fica guardado na conversa —
    // quem já é paciente é reconhecido sem precisar dizer o nome de novo.
    let patientId = conversation.patientId;
    if (patientId === null) {
      const patient = await findPatientByPhone(db, ownerId, message.from);
      if (patient !== null) {
        patientId = patient.id;
        await linkPatient(db, conversation.id, patient.id);
      }
    }

    const result = await respond({
      context: {
        db,
        ownerId,
        conversation,
        contactPhone: message.from,
        today: today(),
        patientId,
      },
      transcript: conversation.transcript,
      userMessage: message.text,
    });

    await saveTranscript(db, conversation.id, result.transcript);
    await sendText({
      phoneNumberId: message.phoneNumberId,
      to: message.from,
      text: result.reply,
      accessToken,
    });
  }
}

const safeParse = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/**
 * O "hoje" do consultório, em `yyyy-MM-dd`.
 *
 * Fixado em São Paulo em vez de usar o relógio do worker: a função roda em
 * UTC, e entre 21h e meia-noite no Brasil o UTC já está no dia seguinte — o que
 * faria a IA recusar um horário de hoje dizendo que a data já passou.
 */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
