/**
 * O piso de segurança sob o atendimento automático: sinais de urgência que
 * tiram a conversa da IA antes de o modelo ver a mensagem.
 *
 * **Por que não deixar o modelo decidir isto.** Ele também decide — a
 * ferramenta `escalar_para_humano` existe justamente para o que esta lista não
 * pega, e o modelo é muito melhor do que uma lista de palavras em quase tudo.
 * Mas um resguardo que falha do mesmo jeito que a coisa resguardada não é
 * resguardo nenhum: se o modelo se enganar sobre a gravidade de uma mensagem,
 * pedir a ele que confira o próprio engano não acrescenta nada. Esta regra é
 * burra de propósito, e o valor dela está exatamente em não compartilhar
 * nenhuma premissa com o modelo.
 *
 * **Ela erra para o lado de escalar demais, e isso é a escolha.** "meu pai teve
 * um infarto ano passado" dispara, e não deveria. O custo desse erro é uma
 * pessoa abrindo uma conversa e vendo que não era nada. O custo do erro
 * contrário é um paciente descrevendo um sintoma grave e recebendo "quer marcar
 * para quinta?". Os dois erros não se comparam, então a régua não fica no meio.
 *
 * Pura e síncrona, como o resto de `domain/`: roda pelo `jiti` sem browser,
 * sem rede e sem chave de API — o que importa aqui, porque é a única parte
 * deste recurso cujo comportamento dá para provar sem a conta da Meta.
 */

export interface UrgencySignal {
  /** O termo da lista que disparou — o que se escreve no motivo do escalonamento. */
  readonly term: string;
}

/**
 * Sinais de emergência médica geral, não de uma especialidade.
 *
 * Deliberadamente curta. Uma lista longa vira ruído: cada termo que dispara sem
 * necessidade gasta a atenção de quem lê a fila, e uma fila que quase sempre é
 * falso alarme deixa de ser lida — que é como um resguardo morre de verdade.
 *
 * Escritos sem acento porque a comparação é feita sobre o texto normalizado
 * (ver `normalize`): quem escreve no WhatsApp com pressa não acentua.
 */
const URGENCY_TERMS: readonly string[] = [
  'dor no peito',
  'aperto no peito',
  'falta de ar',
  'nao consigo respirar',
  'dificuldade para respirar',
  'desmaiei',
  'desmaiou',
  'convulsao',
  'avc',
  'derrame',
  'infarto',
  'sangramento',
  'sangrando muito',
  'vomitando sangue',
  'febre alta',
  'nao para de sangrar',
  'quero morrer',
  'me matar',
  'suicidio',
];

/**
 * O texto pronto para comparação: minúsculas, sem acento, com a pontuação
 * virando espaço e os espaços colapsados.
 *
 * A pontuação vira **espaço** e não nada: "peito,dor" não deve virar
 * "peitodor", e uma mensagem que termina em "dor no peito!!!" tem de casar com
 * o mesmo termo que "dor no peito". Colapsar os espaços depois é o que faz
 * "dor  no   peito" casar também.
 */
const normalize = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    // Remove os diacríticos que o NFD separou das letras.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * O primeiro sinal de urgência na mensagem, ou `null` se não houver nenhum.
 *
 * A comparação é por **palavra inteira**, com os espaços do texto normalizado
 * como fronteira. Sem isso, `avc` casaria dentro de "avcb" e de qualquer
 * palavra que o contivesse; envolver os dois lados em espaço resolve o caso sem
 * precisar de expressão regular por termo — e sem precisar escapar nada, o que
 * é o que faria a lista virar um lugar perigoso de editar.
 */
export function screenForUrgency(message: string): UrgencySignal | null {
  const haystack = ` ${normalize(message)} `;

  for (const term of URGENCY_TERMS) {
    if (haystack.includes(` ${term} `)) return { term };
  }
  return null;
}

/**
 * O que o paciente recebe quando a triagem dispara.
 *
 * Fixo, e escrito uma vez aqui em vez de sair do modelo. A mensagem que uma
 * pessoa lê no pior momento possível não é lugar para variação de geração: ela
 * precisa dizer sempre a mesma coisa, sempre com o mesmo número, e não pode
 * depender de o modelo ter entendido a gravidade — que é justamente o que esta
 * triagem não está disposta a assumir.
 *
 * Não dá orientação clínica e não tenta avaliar nada. Diz o que fazer e diz que
 * um humano foi avisado, que são as duas únicas coisas verdadeiras que o
 * sistema tem para oferecer nesse momento.
 */
export const URGENCY_REPLY =
  'Pelo que você descreveu, isso precisa de avaliação médica agora — não espere ' +
  'uma resposta por aqui. Procure o pronto-socorro mais próximo ou ligue 192 ' +
  '(SAMU). Já avisei a equipe do consultório sobre a sua mensagem.';
