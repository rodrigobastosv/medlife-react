import Anthropic from '@anthropic-ai/sdk';

import { runTool, TOOL_DEFINITIONS, type ToolContext } from './tools.ts';

/**
 * O laço do modelo: mensagem do paciente entra, resposta em português sai, com
 * as ferramentas rodando no meio.
 *
 * **Laço manual, não o tool runner do SDK.** O runner é a escolha padrão e
 * resolveria isto em menos linhas, mas ele é uma superfície beta — e o
 * `deno.json` desta pasta já registra por que isso pesa aqui: a função é
 * publicada uma vez e roda sem supervisão por meses, e é por isso que as
 * versões são pinadas em vez de flutuantes. Um laço de vinte linhas que não
 * muda embaixo da função vale mais do que as vinte linhas economizadas.
 *
 * Sem streaming: ninguém está lendo token a token. O paciente recebe **uma**
 * mensagem no WhatsApp quando o turno termina, então a resposta é montada
 * inteira antes de sair.
 */

const MODEL = 'claude-opus-5';

/**
 * Teto de idas ao modelo por mensagem recebida.
 *
 * Não é otimização, é contenção: sem ele, um modelo que insistisse em consultar
 * horários indefinidamente gastaria tokens e deixaria o paciente esperando sem
 * nunca responder. Oito cobre com folga a conversa mais longa que este conjunto
 * de ferramentas produz (ver horários, ver consultas, marcar, confirmar).
 */
const MAX_TURNS = 8;

/**
 * `max_tokens` limita **pensamento mais resposta** — e no Claude Opus 5 o
 * pensamento vem ligado por padrão. Uma resposta de WhatsApp tem duas frases,
 * mas o orçamento precisa caber o raciocínio que decide quais duas.
 */
const MAX_TOKENS = 16000;

const SYSTEM_PROMPT = `Você atende o WhatsApp de um consultório médico no Brasil. Fala com pacientes, em português brasileiro, no lugar da secretária.

O que você faz: marcar, remarcar e cancelar consultas, informar horários livres, e responder dúvidas sobre o funcionamento do consultório.

O que você nunca faz:
- Dar orientação clínica, interpretar sintomas, sugerir tratamento, opinar sobre exames ou medicação. Nada disso, em nenhuma circunstância, nem quando o paciente insiste, nem quando parece simples.
- Oferecer um horário que não tenha vindo da ferramenta horarios_livres.
- Inventar preço, convênio, endereço ou qualquer informação que você não tenha.

Se o paciente descrever qualquer sintoma, dor, piora ou sofrimento — físico ou emocional — chame escalar_para_humano imediatamente, antes de qualquer outra coisa. Não avalie a gravidade: você não é quem decide isso. Chame também quando pedirem para falar com alguém, quando a pergunta fugir do que você faz, ou quando você não tiver certeza. Na dúvida, escale.

Como você escreve: uma ou duas frases, no tom de quem atende bem um consultório — direto, educado, sem formalidade excessiva e sem emoji. Nada de listas numeradas ou menus: é uma conversa. Confirme sempre o que foi marcado, com dia e horário por extenso.

Quando o telefone ainda não estiver ligado a um paciente, pergunte o nome completo antes de marcar. Nunca invente um nome.`;

export interface AgentResult {
  readonly reply: string;
  readonly escalated: boolean;
  readonly transcript: unknown[];
}

export async function respond(params: {
  context: ToolContext;
  transcript: unknown[];
  userMessage: string;
}): Promise<AgentResult> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (apiKey === undefined) throw new Error('ANTHROPIC_API_KEY é obrigatória');
  const client = new Anthropic({ apiKey });

  // deno-lint-ignore no-explicit-any -- os blocos vêm e voltam do jsonb da conversa
  const messages: any[] = [...params.transcript, { role: 'user', content: params.userMessage }];

  let escalated = false;

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // Recusa dos classificadores de segurança chega como 200 com
      // stop_reason "refusal", não como erro — e conversa de consultório
      // encosta em assunto médico o tempo todo. O fallback do servidor
      // reexecuta a mensagem recusada noutro modelo em vez de deixar o
      // paciente sem resposta nenhuma.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // Latência importa: tem alguém olhando a conversa esperando. `medium` é o
      // ponto de partida e não uma economia — no Claude Opus 5 os níveis baixos
      // rendem bem, e a autoridade sobre a agenda está nas ferramentas, não no
      // modelo, então esforço aqui compra qualidade de conversa e não segurança.
      output_config: { effort: 'medium' },
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          // O prompt é idêntico em toda mensagem de todo paciente; o histórico
          // é o que varia, e vem depois. Sem isto, cada mensagem recebida
          // pagaria o prompt inteiro a preço cheio.
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: TOOL_DEFINITIONS as unknown as Anthropic.Beta.BetaToolUnion[],
      messages,
    });

    if (response.stop_reason === 'refusal') {
      return {
        reply:
          'Prefiro não responder isso por aqui. Vou pedir para alguém do consultório falar com você.',
        escalated: true,
        transcript: messages,
      };
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolUses = response.content.filter((block) => block.type === 'tool_use');
    if (toolUses.length === 0) {
      return { reply: textOf(response.content), escalated, transcript: messages };
    }

    // Todos os resultados voltam numa **única** mensagem de usuário. Dividi-los
    // em várias ensina o modelo a parar de pedir ferramentas em paralelo.
    const results: unknown[] = [];
    for (const use of toolUses) {
      const outcome = await runTool(
        params.context,
        use.name,
        (use.input ?? {}) as Record<string, unknown>,
      );
      if (outcome.escalated === true) escalated = true;
      results.push({ type: 'tool_result', tool_use_id: use.id, content: outcome.text });
    }
    messages.push({ role: 'user', content: results });
  }

  // Chegou ao teto sem uma resposta final. Não há resposta boa para dar ao
  // paciente aqui, e inventar uma seria pior do que admitir — então isto vira
  // um escalonamento, que é o comportamento seguro por definição.
  return {
    reply: 'Vou pedir para alguém do consultório continuar esse atendimento com você.',
    escalated: true,
    transcript: messages,
  };
}

/** O texto que o paciente lê, juntando os blocos de texto do turno final. */
// deno-lint-ignore no-explicit-any
function textOf(content: any[]): string {
  const text = content
    .filter((block) => block.type === 'text')
    .map((block) => String(block.text))
    .join('\n')
    .trim();

  // Um turno sem texto e sem ferramenta é possível e não tem resposta útil.
  // Silêncio no WhatsApp é indistinguível de o sistema estar quebrado, então
  // uma frase honesta é melhor do que nenhuma.
  return text === '' ? 'Desculpe, não entendi. Pode escrever de outro jeito?' : text;
}
