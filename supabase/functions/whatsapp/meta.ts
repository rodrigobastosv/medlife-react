/**
 * Tudo o que fala com a Meta: provar que uma requisição veio dela, entender o
 * que ela entregou, e mandar a resposta de volta.
 *
 * Os dois sentidos passam por aqui e **os dois são nossos**. A Meta nunca lê a
 * agenda: ela faz POST no nosso endpoint quando o paciente escreve, e nós
 * fazemos POST na API dela para responder. Não existe caminho em que o WhatsApp
 * consulta o banco do MedLife — a agenda nunca sai do Postgres, o código lê a
 * vaga e escreve a resposta dentro de uma mensagem.
 */

const GRAPH_VERSION = 'v21.0';

/* --- Entrada: provar que veio da Meta -------------------------------------- */

/**
 * Confere a assinatura `X-Hub-Signature-256` sobre o corpo **cru** da
 * requisição.
 *
 * O corpo tem de ser exatamente os bytes recebidos, nunca um `JSON.parse`
 * seguido de `JSON.stringify`: reserializar reordena chaves e muda espaços, e a
 * assinatura passa a não bater por um motivo que não tem nada a ver com
 * autenticidade. Quem chama lê o corpo como texto uma vez e passa o mesmo texto
 * para cá e para o parser.
 *
 * Esta função é para o webhook o que o segredo compartilhado é para a `notify`:
 * a URL é pública, e sem isto qualquer pessoa que a descobrisse poderia fazer a
 * IA responder — e marcar consultas — em nome de um paciente qualquer.
 */
export async function verifySignature(params: {
  rawBody: string;
  header: string | null;
  appSecret: string;
}): Promise<boolean> {
  const { rawBody, header, appSecret } = params;
  if (header === null || !header.startsWith('sha256=')) return false;

  const expected = header.slice('sha256='.length);

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const actual = [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqual(actual, expected);
}

/**
 * Comparação em tempo constante.
 *
 * `actual === expected` retorna no primeiro byte diferente, e a diferença de
 * tempo entre "errou no primeiro caractere" e "errou no último" é medível pela
 * rede. Isso deixa alguém descobrir a assinatura correta um byte por vez, sem
 * nunca saber o segredo. Percorrer o comprimento inteiro acumulando um OU
 * exclusivo remove o sinal.
 *
 * O comprimento é comparado antes e sai cedo — isso vaza só o tamanho, que é
 * fixo e público para um HMAC-SHA256 em hexadecimal.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* --- Entrada: o que a Meta entregou ---------------------------------------- */

export interface IncomingMessage {
  /** Id do número **do consultório** que recebeu — é por ele que se acha o médico. */
  readonly phoneNumberId: string;
  /** Telefone de quem escreveu, em E.164 sem o '+', como a Cloud API entrega. */
  readonly from: string;
  readonly text: string;
}

/**
 * As mensagens de texto de um payload de webhook.
 *
 * A Meta entrega um envelope com três níveis de array (`entry` → `changes` →
 * `value.messages`) e pode mandar mais de uma mensagem por POST, então isto
 * devolve uma lista e não uma mensagem.
 *
 * **Tudo que não é texto é descartado em silêncio, de propósito.** O mesmo
 * webhook recebe recibos de entrega e de leitura — que chegam em volume muito
 * maior que as mensagens — além de áudio, imagem e figurinha. Tratar um recibo
 * como mensagem faria a IA responder ao próprio "entregue"; e um áudio que a
 * função não sabe transcrever é melhor ignorado aqui do que respondido com um
 * palpite. O que este recorte deixa de fora é uma limitação real e está
 * anotada na issue #40.
 */
export function parseIncoming(payload: unknown): IncomingMessage[] {
  const messages: IncomingMessage[] = [];
  const entries = asArray(read(payload, 'entry'));

  for (const entry of entries) {
    for (const change of asArray(read(entry, 'changes'))) {
      const value = read(change, 'value');
      const phoneNumberId = asString(read(read(value, 'metadata'), 'phone_number_id'));
      if (phoneNumberId === null) continue;

      for (const message of asArray(read(value, 'messages'))) {
        if (asString(read(message, 'type')) !== 'text') continue;
        const from = asString(read(message, 'from'));
        const text = asString(read(read(message, 'text'), 'body'));
        if (from === null || text === null) continue;
        messages.push({ phoneNumberId, from, text });
      }
    }
  }

  return messages;
}

/*
  Leitores estreitos em vez de um cast do payload inteiro para uma interface.

  O corpo vem de fora e é `unknown` de verdade: uma mudança de formato do lado
  da Meta, ou um POST forjado que passasse pela assinatura, produziria um objeto
  com a forma errada. Um `as WebhookPayload` faria isso virar um TypeError em
  produção, dentro de um `for`, com a mensagem já confirmada para a Meta. Estes
  quatro leitores fazem o mesmo caminho terminar em "nenhuma mensagem".
*/
const read = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/* --- Saída: responder ------------------------------------------------------ */

/**
 * Manda uma mensagem de texto pela Cloud API.
 *
 * Erros são lançados com o corpo da resposta junto: a Meta explica a recusa no
 * JSON (número fora da janela de 24 horas, template obrigatório, token expirado)
 * e um `Error: 400` sem esse texto não diz qual dos casos aconteceu.
 */
export async function sendText(params: {
  phoneNumberId: string;
  to: string;
  text: string;
  accessToken: string;
}): Promise<void> {
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${params.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${params.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: params.to,
        type: 'text',
        text: { body: params.text },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Cloud API respondeu ${response.status}: ${await response.text()}`);
  }
}
