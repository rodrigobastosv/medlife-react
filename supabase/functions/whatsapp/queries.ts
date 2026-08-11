import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  toAppointmentLocation,
  type AppointmentLocation,
  type AvailabilityException,
  type AvailabilityRule,
  type BookedAppointment,
} from './slots.ts';

/**
 * Tudo o que esta função lê e escreve, num lugar só.
 *
 * Roda com a **service role**, como a `notify`, e pelo mesmo motivo: quem
 * escreve não é um usuário autenticado, é o webhook. Isso desliga o RLS, então
 * cada leitura aqui é escrita para ser explícita sobre o escopo em vez de
 * confiar numa policy — todo `select` filtra por `owner_id`, e o `owner_id` vem
 * do `phone_number_id` que a Meta entregou, nunca de nada que o paciente possa
 * escrever.
 */

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (url === undefined || key === undefined) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/* --- De quem é a agenda ---------------------------------------------------- */

export async function findOwnerByPhoneNumberId(
  db: SupabaseClient,
  phoneNumberId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from('whatsapp_numbers')
    .select('owner_id')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();

  if (error !== null) throw new Error(`whatsapp_numbers: ${error.message}`);
  return (data?.owner_id as string | undefined) ?? null;
}

/* --- A conversa ------------------------------------------------------------ */

export interface Conversation {
  readonly id: string;
  readonly patientId: string | null;
  readonly status: string;
  /** Blocos da Messages API como vieram — ver o comentário em `012_whatsapp.sql`. */
  readonly transcript: unknown[];
}

/**
 * A conversa deste contato, criada se ainda não existir.
 *
 * Upsert em `(owner_id, contact_phone)`, o índice único da migração: a primeira
 * mensagem de um número desconhecido e a décima do mesmo número passam pelo
 * mesmo caminho, sem a função precisar saber qual das duas é.
 */
export async function loadConversation(
  db: SupabaseClient,
  ownerId: string,
  contactPhone: string,
): Promise<Conversation> {
  const { data, error } = await db
    .from('whatsapp_conversations')
    .upsert(
      { owner_id: ownerId, contact_phone: contactPhone, last_message_at: new Date().toISOString() },
      { onConflict: 'owner_id,contact_phone', ignoreDuplicates: false },
    )
    .select('id, patient_id, status, transcript')
    .single();

  if (error !== null) throw new Error(`whatsapp_conversations: ${error.message}`);
  return {
    id: data.id as string,
    patientId: (data.patient_id as string | null) ?? null,
    status: data.status as string,
    transcript: Array.isArray(data.transcript) ? (data.transcript as unknown[]) : [],
  };
}

export async function saveTranscript(
  db: SupabaseClient,
  conversationId: string,
  transcript: unknown[],
): Promise<void> {
  const { error } = await db
    .from('whatsapp_conversations')
    .update({ transcript })
    .eq('id', conversationId);
  if (error !== null) throw new Error(`saveTranscript: ${error.message}`);
}

export async function linkPatient(
  db: SupabaseClient,
  conversationId: string,
  patientId: string,
): Promise<void> {
  const { error } = await db
    .from('whatsapp_conversations')
    .update({ patient_id: patientId })
    .eq('id', conversationId);
  if (error !== null) throw new Error(`linkPatient: ${error.message}`);
}

/**
 * Tira a conversa da IA e põe na fila humana.
 *
 * Idempotente por construção: escrever o mesmo status duas vezes não muda nada,
 * e a triagem de urgência pode disparar de novo na mensagem seguinte antes de
 * alguém ter aberto a fila.
 */
export async function escalate(
  db: SupabaseClient,
  conversationId: string,
  reason: string,
): Promise<void> {
  const { error } = await db
    .from('whatsapp_conversations')
    .update({
      status: 'escalated',
      escalated_at: new Date().toISOString(),
      escalation_reason: reason,
    })
    .eq('id', conversationId);
  if (error !== null) throw new Error(`escalate: ${error.message}`);
}

/* --- Pacientes ------------------------------------------------------------- */

export interface PatientRow {
  readonly id: string;
  readonly fullName: string;
}

/**
 * O paciente cujo telefone bate com quem escreveu.
 *
 * A comparação é feita **em memória sobre os dígitos**, e não com um `like` no
 * banco, porque `patients.phone` é um campo de texto livre digitado à mão:
 * "(85) 99999-8888", "85999998888" e "+55 85 99999-8888" são a mesma pessoa e
 * nenhum `like` os une. `digitsOf` é a mesma normalização que `toWhatsAppNumber`
 * faz em `src/domain/patients/patient-phone.ts` — inclusive a regra de que só
 * 12 ou 13 dígitos já carregam o código do país, porque `55` é tanto o Brasil
 * quanto o DDD de Santa Maria.
 *
 * O custo é ler os pacientes do médico para casar um telefone. Aceitável na
 * escala de um consultório e explicitamente limitado; se a base crescer, o
 * lugar de resolver isso é uma coluna normalizada com índice, não um `like`.
 */
export async function findPatientByPhone(
  db: SupabaseClient,
  ownerId: string,
  contactPhone: string,
): Promise<PatientRow | null> {
  const { data, error } = await db
    .from('patients')
    .select('id, full_name, phone')
    .eq('owner_id', ownerId)
    .not('phone', 'is', null);

  if (error !== null) throw new Error(`patients: ${error.message}`);

  const wanted = contactPhone.replace(/\D/g, '');
  for (const row of data ?? []) {
    if (toWhatsAppDigits(row.phone as string | null) === wanted) {
      return { id: row.id as string, fullName: row.full_name as string };
    }
  }
  return null;
}

/** Cópia de `toWhatsAppNumber` — ver o comentário acima e o original em `src/domain/patients/`. */
function toWhatsAppDigits(phone: string | null): string | null {
  if (phone === null) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits;
  return null;
}

export async function createPatient(
  db: SupabaseClient,
  ownerId: string,
  fullName: string,
  contactPhone: string,
): Promise<PatientRow> {
  const { data, error } = await db
    .from('patients')
    .insert({
      owner_id: ownerId,
      full_name: fullName,
      phone: contactPhone,
      // A origem diz de onde o paciente veio, e "whatsapp" não é um valor do
      // enum que o app Flutter conhece. 'other' é o honesto aqui; de onde a
      // consulta veio fica em `appointments.source`, que é aditivo.
      origin: 'other',
    })
    .select('id, full_name')
    .single();

  if (error !== null) throw new Error(`createPatient: ${error.message}`);
  return { id: data.id as string, fullName: data.full_name as string };
}

/* --- Agenda ---------------------------------------------------------------- */

export async function fetchAvailability(
  db: SupabaseClient,
  ownerId: string,
): Promise<{ rules: AvailabilityRule[]; exceptions: AvailabilityException[] }> {
  const [rulesResult, exceptionsResult] = await Promise.all([
    db.from('availability_rules').select('*').eq('owner_id', ownerId),
    db.from('availability_exceptions').select('*').eq('owner_id', ownerId),
  ]);

  if (rulesResult.error !== null)
    throw new Error(`availability_rules: ${rulesResult.error.message}`);
  if (exceptionsResult.error !== null) {
    throw new Error(`availability_exceptions: ${exceptionsResult.error.message}`);
  }

  return {
    rules: (rulesResult.data ?? []).map((row) => ({
      location: toAppointmentLocation(row.location as string),
      weekday: row.weekday as number,
      startTime: trimTime(row.start_time as string),
      endTime: trimTime(row.end_time as string),
      slotDurationMinutes: row.slot_duration_minutes as number,
    })),
    exceptions: (exceptionsResult.data ?? []).map((row) => ({
      date: row.exception_date as string,
      location: row.location === null ? null : toAppointmentLocation(row.location as string),
      isClosed: row.is_closed as boolean,
      startTime: row.start_time === null ? null : trimTime(row.start_time as string),
      endTime: row.end_time === null ? null : trimTime(row.end_time as string),
      slotDurationMinutes: (row.slot_duration_minutes as number | null) ?? null,
    })),
  };
}

/** Postgres devolve `time` como `HH:mm:ss`; as regras comparam `HH:mm`. */
const trimTime = (value: string): string => value.slice(0, 5);

export async function fetchAppointmentsOnDay(
  db: SupabaseClient,
  ownerId: string,
  day: string,
): Promise<BookedAppointment[]> {
  const { data, error } = await db
    .from('appointments')
    .select('id, scheduled_time, location, status, patients(full_name)')
    .eq('owner_id', ownerId)
    .eq('scheduled_date', day);

  if (error !== null) throw new Error(`appointments: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    scheduledTime: row.scheduled_time === null ? null : trimTime(row.scheduled_time as string),
    location: toAppointmentLocation(row.location as string),
    status: row.status as string,
    patientName: (row.patients as { full_name?: string } | null)?.full_name ?? null,
  }));
}

export interface PatientAppointment {
  readonly id: string;
  readonly date: string;
  readonly time: string | null;
  readonly location: AppointmentLocation;
  readonly status: string;
}

/** As consultas futuras do paciente — o que responde "minha consulta de quinta". */
export async function fetchUpcomingForPatient(
  db: SupabaseClient,
  ownerId: string,
  patientId: string,
  fromDay: string,
): Promise<PatientAppointment[]> {
  const { data, error } = await db
    .from('appointments')
    .select('id, scheduled_date, scheduled_time, location, status')
    .eq('owner_id', ownerId)
    .eq('patient_id', patientId)
    .gte('scheduled_date', fromDay)
    .order('scheduled_date', { ascending: true });

  if (error !== null) throw new Error(`fetchUpcomingForPatient: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    date: row.scheduled_date as string,
    time: row.scheduled_time === null ? null : trimTime(row.scheduled_time as string),
    location: toAppointmentLocation(row.location as string),
    status: row.status as string,
  }));
}

/**
 * Marca a consulta.
 *
 * `source: 'whatsapp'` e `created_by` do usuário-robô são o que fazem a
 * `notify` avisar a médica sem uma linha nova: ela já anuncia consultas cujo
 * `created_by` difere do dono da agenda. Se `WHATSAPP_BOT_USER_ID` não estiver
 * configurado, `created_by` fica nulo e o aviso não sai — a consulta é marcada
 * do mesmo jeito, e `source` continua registrando de onde veio.
 */
export async function createAppointment(
  db: SupabaseClient,
  params: {
    ownerId: string;
    patientId: string;
    day: string;
    time: string;
    location: AppointmentLocation;
    type: string;
  },
): Promise<string> {
  const botUserId = Deno.env.get('WHATSAPP_BOT_USER_ID') ?? null;

  const { data, error } = await db
    .from('appointments')
    .insert({
      owner_id: params.ownerId,
      patient_id: params.patientId,
      scheduled_date: params.day,
      scheduled_time: params.time,
      location: params.location,
      type: params.type,
      // Uma consulta marcada pelo WhatsApp é sempre futura e nunca aconteceu
      // ainda. O default da coluna é 'completed', que serve para o app
      // registrando uma visita que já ocorreu — aqui seria receita nunca ganha
      // entrando no relatório.
      status: 'scheduled',
      source: 'whatsapp',
      created_by: botUserId,
    })
    .select('id')
    .single();

  if (error !== null) throw new Error(`createAppointment: ${error.message}`);
  return data.id as string;
}

export async function rescheduleAppointment(
  db: SupabaseClient,
  ownerId: string,
  appointmentId: string,
  day: string,
  time: string,
): Promise<void> {
  const { error } = await db
    .from('appointments')
    .update({ scheduled_date: day, scheduled_time: time })
    .eq('id', appointmentId)
    // Redundante com o id, e de propósito: com o RLS desligado, é este filtro
    // que impede que um id vazado de outra agenda seja alterado daqui.
    .eq('owner_id', ownerId);

  if (error !== null) throw new Error(`rescheduleAppointment: ${error.message}`);
}

export async function cancelAppointment(
  db: SupabaseClient,
  ownerId: string,
  appointmentId: string,
): Promise<void> {
  const { error } = await db
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appointmentId)
    .eq('owner_id', ownerId);

  if (error !== null) throw new Error(`cancelAppointment: ${error.message}`);
}
