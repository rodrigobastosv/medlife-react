import type { SupabaseClient } from '@supabase/supabase-js';

import {
  APPOINTMENT_LOCATIONS,
  conflictsAt,
  freeSlots,
  toAppointmentLocation,
  type AppointmentLocation,
} from './slots.ts';
import {
  cancelAppointment,
  createAppointment,
  createPatient,
  escalate,
  fetchAppointmentsOnDay,
  fetchAvailability,
  fetchUpcomingForPatient,
  linkPatient,
  rescheduleAppointment,
  type Conversation,
} from './queries.ts';

/**
 * As ferramentas, que são a fronteira de autoridade deste recurso.
 *
 * **O modelo propõe; isto decide.** Nenhuma regra de agenda vive no prompt: se
 * o modelo se convencer de que cabe uma consulta às 09:15, `conflictsAt` ainda
 * responde que não cabe e a ferramenta recusa. É a mesma separação que o app
 * faz entre domínio e UI, e é o que faz um erro de modelo virar uma frase
 * estranha para o paciente em vez de uma consulta errada no banco.
 *
 * As recusas voltam como texto em português dentro do `tool_result`, não como
 * erro. O modelo lê "esse horário já está ocupado" e explica ao paciente,
 * oferecendo outro — que é a conversa que deveria acontecer. Um erro derrubaria
 * o turno e deixaria a pessoa sem resposta.
 */

export interface ToolContext {
  readonly db: SupabaseClient;
  readonly ownerId: string;
  readonly conversation: Conversation;
  readonly contactPhone: string;
  /** `yyyy-MM-dd` na hora local do consultório — o "hoje" da conversa. */
  readonly today: string;
  /** Mutável: uma consulta marcada para um número novo passa a ter paciente. */
  patientId: string | null;
}

const LOCATION_ENUM = [...APPOINTMENT_LOCATIONS];

export const TOOL_DEFINITIONS = [
  {
    name: 'horarios_livres',
    description:
      'Lista os horários livres de um dia num local de atendimento. Use antes de oferecer qualquer horário ao paciente — nunca invente ou suponha disponibilidade. Devolve lista vazia quando a médica não atende naquele dia naquele local.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'Dia no formato yyyy-MM-dd.' },
        local: { type: 'string', enum: LOCATION_ENUM, description: 'Local de atendimento.' },
      },
      required: ['data', 'local'],
      additionalProperties: false,
    },
  },
  {
    name: 'consultas_do_paciente',
    description:
      'As consultas futuras já marcadas para este paciente, com o id de cada uma. Use antes de remarcar ou cancelar — é de onde vem o id, que o paciente nunca sabe informar.',
    strict: true,
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'marcar_consulta',
    description:
      'Marca uma consulta. Só use um horário que veio de horarios_livres. Se o telefone ainda não estiver ligado a um paciente, informe nome_do_paciente para cadastrá-lo — pergunte o nome completo antes, nunca invente.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'Dia no formato yyyy-MM-dd.' },
        horario: { type: 'string', description: 'Horário no formato HH:mm.' },
        local: { type: 'string', enum: LOCATION_ENUM },
        tipo: {
          type: 'string',
          enum: ['first_visit', 'visit', 'return'],
          description: 'first_visit para quem nunca veio, return para retorno, visit no resto.',
        },
        nome_do_paciente: {
          type: ['string', 'null'],
          description:
            'Nome completo, obrigatório apenas quando o paciente ainda não é cadastrado.',
        },
      },
      required: ['data', 'horario', 'local', 'tipo', 'nome_do_paciente'],
      additionalProperties: false,
    },
  },
  {
    name: 'remarcar_consulta',
    description:
      'Move uma consulta existente para outro dia e horário. O id vem de consultas_do_paciente.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        consulta_id: { type: 'string' },
        nova_data: { type: 'string', description: 'yyyy-MM-dd.' },
        novo_horario: { type: 'string', description: 'HH:mm.' },
      },
      required: ['consulta_id', 'nova_data', 'novo_horario'],
      additionalProperties: false,
    },
  },
  {
    name: 'cancelar_consulta',
    description: 'Cancela uma consulta existente. O id vem de consultas_do_paciente.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { consulta_id: { type: 'string' } },
      required: ['consulta_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'escalar_para_humano',
    description:
      'Passa a conversa para uma pessoa do consultório e encerra o atendimento automático. Use sempre que houver qualquer sinal de urgência ou sofrimento, quando o paciente pedir para falar com alguém, quando pedirem orientação clínica, ou quando você não souber responder com segurança. Na dúvida, escale — errar escalando custa a atenção de alguém, errar sem escalar custa muito mais.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        motivo: {
          type: 'string',
          description: 'O que aconteceu, em uma frase, para quem vai abrir a fila.',
        },
      },
      required: ['motivo'],
      additionalProperties: false,
    },
  },
] as const;

export interface ToolOutcome {
  readonly text: string;
  /** `true` encerra o turno: a conversa saiu da IA e não volta nesta mensagem. */
  readonly escalated?: boolean;
}

export async function runTool(
  context: ToolContext,
  name: string,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  switch (name) {
    case 'horarios_livres':
      return await listFreeSlots(context, input);
    case 'consultas_do_paciente':
      return await listAppointments(context);
    case 'marcar_consulta':
      return await book(context, input);
    case 'remarcar_consulta':
      return await reschedule(context, input);
    case 'cancelar_consulta':
      return await cancel(context, input);
    case 'escalar_para_humano':
      return await handOff(context, input);
    default:
      return { text: `Ferramenta desconhecida: ${name}.` };
  }
}

/* --- Leitura --------------------------------------------------------------- */

async function listFreeSlots(
  context: ToolContext,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const day = asString(input.data);
  const location = toAppointmentLocation(asString(input.local));
  if (day === null || !isDay(day)) return { text: 'Data inválida — use o formato yyyy-MM-dd.' };
  if (day < context.today) {
    return {
      text: `${day} já passou. Hoje é ${context.today}; ofereça uma data a partir de hoje.`,
    };
  }

  const [{ rules, exceptions }, appointments] = await Promise.all([
    fetchAvailability(context.db, context.ownerId),
    fetchAppointmentsOnDay(context.db, context.ownerId, day),
  ]);

  const slots = freeSlots({
    day,
    location,
    rules,
    exceptions,
    // O dia inteiro, de qualquer local: a médica é uma pessoa só.
    bookedTimes: appointments
      .filter((appointment) => appointment.status !== 'cancelled')
      .flatMap((appointment) =>
        appointment.scheduledTime === null ? [] : [appointment.scheduledTime],
      ),
  });

  if (slots.length === 0) {
    return { text: `Não há atendimento em ${day} nesse local, ou o dia já está cheio.` };
  }
  return { text: `Horários livres em ${day}: ${slots.join(', ')}.` };
}

async function listAppointments(context: ToolContext): Promise<ToolOutcome> {
  if (context.patientId === null) {
    return { text: 'Este telefone ainda não está ligado a nenhum paciente cadastrado.' };
  }

  const upcoming = await fetchUpcomingForPatient(
    context.db,
    context.ownerId,
    context.patientId,
    context.today,
  );
  const active = upcoming.filter((appointment) => appointment.status !== 'cancelled');
  if (active.length === 0) return { text: 'Nenhuma consulta futura marcada.' };

  return {
    text: active
      .map((a) => `id=${a.id} · ${a.date} ${a.time ?? '(sem horário)'} · ${a.location}`)
      .join('\n'),
  };
}

/* --- Escrita --------------------------------------------------------------- */

async function book(context: ToolContext, input: Record<string, unknown>): Promise<ToolOutcome> {
  const day = asString(input.data);
  const time = asString(input.horario);
  const location = toAppointmentLocation(asString(input.local));
  const type = asString(input.tipo) ?? 'visit';
  const name = asString(input.nome_do_paciente);

  if (day === null || !isDay(day)) return { text: 'Data inválida — use yyyy-MM-dd.' };
  if (time === null || !isTime(time)) return { text: 'Horário inválido — use HH:mm.' };
  if (day < context.today) {
    return { text: `Não dá para marcar em ${day}: já passou. Hoje é ${context.today}.` };
  }

  const guard = await guardSlot(context, { day, time, location, ignoreAppointmentId: null });
  if (guard !== null) return guard;

  // O paciente é resolvido depois da checagem de horário, e não antes: um
  // cadastro criado para uma consulta que a regra vai recusar deixaria um
  // paciente órfão no banco a cada tentativa em horário ocupado.
  let patientId = context.patientId;
  if (patientId === null) {
    if (name === null || name.trim() === '') {
      return {
        text: 'Antes de marcar, pergunte o nome completo do paciente e informe em nome_do_paciente.',
      };
    }
    const created = await createPatient(
      context.db,
      context.ownerId,
      name.trim(),
      context.contactPhone,
    );
    patientId = created.id;
    context.patientId = created.id;
    await linkPatient(context.db, context.conversation.id, created.id);
  }

  await createAppointment(context.db, {
    ownerId: context.ownerId,
    patientId,
    day,
    time,
    location,
    type,
  });

  return { text: `Consulta marcada para ${day} às ${time}.` };
}

async function reschedule(
  context: ToolContext,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const appointmentId = asString(input.consulta_id);
  const day = asString(input.nova_data);
  const time = asString(input.novo_horario);

  if (appointmentId === null) return { text: 'Informe consulta_id (veja consultas_do_paciente).' };
  if (day === null || !isDay(day)) return { text: 'Data inválida — use yyyy-MM-dd.' };
  if (time === null || !isTime(time)) return { text: 'Horário inválido — use HH:mm.' };
  if (day < context.today) return { text: `Não dá para remarcar para ${day}: já passou.` };

  const owned = await findOwnedAppointment(context, appointmentId);
  if (owned === null) return { text: 'Essa consulta não é deste paciente.' };

  const guard = await guardSlot(context, {
    day,
    time,
    location: owned.location,
    // A própria consulta não conta como choque consigo mesma.
    ignoreAppointmentId: appointmentId,
  });
  if (guard !== null) return guard;

  await rescheduleAppointment(context.db, context.ownerId, appointmentId, day, time);
  return { text: `Consulta remarcada para ${day} às ${time}.` };
}

async function cancel(context: ToolContext, input: Record<string, unknown>): Promise<ToolOutcome> {
  const appointmentId = asString(input.consulta_id);
  if (appointmentId === null) return { text: 'Informe consulta_id (veja consultas_do_paciente).' };

  const owned = await findOwnedAppointment(context, appointmentId);
  if (owned === null) return { text: 'Essa consulta não é deste paciente.' };

  await cancelAppointment(context.db, context.ownerId, appointmentId);
  return { text: 'Consulta cancelada.' };
}

async function handOff(context: ToolContext, input: Record<string, unknown>): Promise<ToolOutcome> {
  const reason = asString(input.motivo)?.trim();
  await escalate(
    context.db,
    context.conversation.id,
    reason === undefined || reason === '' ? 'A IA pediu ajuda sem informar o motivo.' : reason,
  );
  return { text: 'Conversa passada para a equipe do consultório.', escalated: true };
}

/* --- As guardas ------------------------------------------------------------ */

/**
 * Recusa um horário que a agenda não permite, ou `null` se estiver livre.
 *
 * Duas checagens, e as duas importam. `freeSlots` responde "esse horário existe
 * na jornada declarada"; `conflictsAt` responde "ninguém está nele". Um horário
 * pode passar na primeira e falhar na segunda quando outra pessoa marcou entre
 * a consulta do modelo e a decisão dele — que numa conversa de WhatsApp é uma
 * janela de segundos, mas é real.
 *
 * Note que **a IA não faz encaixe.** O formulário do app avisa e deixa salvar,
 * porque tem uma pessoa lendo o aviso e decidindo; aqui não tem. Um encaixe é
 * uma decisão de quem conhece a agenda e o paciente, e não é uma decisão que se
 * delega a um atendimento automático.
 */
async function guardSlot(
  context: ToolContext,
  params: {
    day: string;
    time: string;
    location: AppointmentLocation;
    ignoreAppointmentId: string | null;
  },
): Promise<ToolOutcome | null> {
  const [{ rules, exceptions }, appointments] = await Promise.all([
    fetchAvailability(context.db, context.ownerId),
    fetchAppointmentsOnDay(context.db, context.ownerId, params.day),
  ]);

  const open = freeSlots({
    day: params.day,
    location: params.location,
    rules,
    exceptions,
    bookedTimes: [],
  });
  if (!open.includes(params.time)) {
    return {
      text:
        open.length === 0
          ? `A médica não atende em ${params.day} nesse local.`
          : `${params.time} não é um horário de atendimento em ${params.day}. Disponíveis: ${open.join(', ')}.`,
    };
  }

  const conflicts = conflictsAt({
    day: params.day,
    time: params.time,
    location: params.location,
    appointments,
    rules,
    exceptions,
    ignoreAppointmentId: params.ignoreAppointmentId,
  });
  if (conflicts.length > 0) {
    return { text: `${params.time} já está ocupado em ${params.day}. Ofereça outro horário.` };
  }

  return null;
}

/**
 * A consulta, se ela for deste paciente.
 *
 * O id vem de `consultas_do_paciente`, mas isso não basta como garantia: o
 * modelo pode repetir um id de um turno antigo, e a service role escreveria em
 * qualquer linha. Reconferir contra as consultas do paciente é o que impede que
 * uma conversa cancele a consulta de outra pessoa.
 */
async function findOwnedAppointment(
  context: ToolContext,
  appointmentId: string,
): Promise<{ location: AppointmentLocation } | null> {
  if (context.patientId === null) return null;
  const upcoming = await fetchUpcomingForPatient(
    context.db,
    context.ownerId,
    context.patientId,
    context.today,
  );
  const match = upcoming.find((appointment) => appointment.id === appointmentId);
  return match === undefined ? null : { location: match.location };
}

/* --- Leitores estreitos ---------------------------------------------------- */

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const isDay = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);
const isTime = (value: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
